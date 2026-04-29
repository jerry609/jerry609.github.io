---
title: 'DeepSeek-V4 的 KV 压缩：从删 token 误解到预算检索'
description: '从 CSA、HCA 和 SWA 的分工出发，将 DeepSeek-V4 的百万上下文注意力理解为带预算的检索、压缩与端到端损失最小化问题。'
publishDate: '2026-04-30'
tags: ['ai', 'deepseek', 'transformer', 'attention', 'kv-cache']
language: 'zh-CN'
draft: false
---

DeepSeek-V4 的百万上下文能力常被简化为如下判断：

> 模型只读取 top-k，因此其余 token 对生成没有贡献。

该判断省略了压缩表示、检索预算和多分支注意力之间的分工。

更合适的建模方式是：长上下文 attention 可视为带预算的检索与汇聚。每个 query 都需要在给定计算预算内决定访问哪些历史记忆。

DeepSeek-V4 的混合注意力设计可以概括为：

> 近邻原始读取，远程分辨率压缩，相关记忆预算检索。

top-k 之外的 token 仍然可能携带有效信息。这些 token 只是在**当前层、当前 query、当前 head/分支**里，未被单独展开读取。相关信息可能已经进入 block 摘要，可能保留在 HCA 的全局粗粒度记忆中，也可能对当前预测的边际贡献较小。

主要参考资料包括 [DeepSeek-V4 技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf) 和 Hugging Face 的 [DeepSeek-V4 解读](https://huggingface.co/blog/deepseekv4)。报告给出的配置包括：V4-Pro 支持 1M token 上下文，CSA 压缩率 $m=4$、attention top-k 为 1024，HCA 压缩率 $m'=128$，SWA 窗口为 128；V4-Flash 的 CSA top-k 为 512。

## 符号表

下表列出后续公式使用的主要符号。

| 符号 | 含义 |
| --- | --- |
| $t$ | 当前生成位置，也就是当前 query 的位置 |
| $i,\ell,r$ | 历史 token 的位置下标 |
| $b,j$ | 压缩块或 compressed memory entry 的下标 |
| $\mathcal{P}_t$ | 位置 $t$ 的可见历史 token 集合，通常是 $i<t$ |
| $h_i$ | 第 $i$ 个 token 在某层的 hidden state |
| $q_t,k_i,v_i$ | query、key、value 向量 |
| $e_{t,i}$ | attention 的原始打分，通常是 $q_t^\top k_i$ |
| $\alpha_{t,i}$ | softmax 后的 attention 权重 |
| $o_t$ | full attention 在位置 $t$ 的输出 |
| $B_b$ | 第 $b$ 个压缩块包含的 token 下标集合 |
| $m$ | CSA/c4a 的压缩步长或压缩率，V4-Pro 里典型值是 4 |
| $m'$ | HCA/c128a 的压缩率，V4-Pro 里典型值是 128 |
| $n_{\mathrm{win}}$ | sliding window 的长度，V4-Pro 里是 128 |
| $\Phi_\phi$ | 带参数 $\phi$ 的压缩器 |
| $z_b$ | 第 $b$ 个 compressed KV entry |
| $g_\psi$ | 带参数 $\psi$ 的 indexer 打分函数 |
| $S_t$ | 位置 $t$ 被选中的 compressed block 集合 |
| $k$ | top-k 里的预算，V4-Pro 的 CSA attention top-k 是 1024 |
| $R_t(S)$ | 未被集合 $S$ 捕获的残余 attention mass |
| $V$ | value 向量范数的上界 |
| $M,C$ | KV memory 和 FLOPs 预算 |
| $\theta,\phi,\psi$ | 主模型、压缩器、检索器的参数 |
| $\Delta_i$ | 删除、合并或不展开 token $i$ 后造成的输出分布变化 |
| $D_{\mathrm{KL}}$ | KL divergence，用来比较两个输出分布 |
| $\Delta\mathrm{NLL}$ | 稀疏压缩模型相对 full attention 的负对数似然变化 |
| $\mathcal{I}_{\mathrm{local}}$ | sliding window 中的原始 KV 位置 |
| $\mathcal{I}_{\mathrm{remote}}$ | 远程 compressed KV 位置 |
| $\mathcal{I}_{\mathrm{attn}}$ | 当前 sparse kernel 实际会读取的 KV row 集合 |
| $\odot$ | 按维度相乘 |

## 1. 压缩对象与表示形态

完整 attention 先从可见历史集合开始。当前位置是 $t$，可见历史位置写成：

$$
\mathcal{P}_t=\{i:0\le i<t\}
$$

每个历史 token 先和当前 query 做点积：

$$
e_{t,i}=q_t^\top k_i,\qquad i\in\mathcal{P}_t
$$

然后在所有可见历史位置上做 softmax：

$$
\alpha_{t,i}
=
\frac{\exp(e_{t,i})}
{\sum_{\ell\in\mathcal{P}_t}\exp(e_{t,\ell})},
\qquad
\sum_{i\in\mathcal{P}_t}\alpha_{t,i}=1
$$

最后用这些权重加权 value：

$$
o_t
=
\sum_{i\in\mathcal{P}_t}\alpha_{t,i}v_i
$$

若直接减少可见 token，确实会引入信息损失；DeepSeek-V4 的机制首先改变历史信息的表示形式，再在压缩表示上执行预算检索。

DeepSeek-V4 的 CSA（Compressed Sparse Attention）先将一小段历史压缩为一个可以检索的 memory entry。第 $b$ 个压缩块包含：

$$
B_b=\{bm,bm+1,\ldots,bm+m-1\}
$$

压缩器将该 block 的 hidden states 转换为一个 compressed KV entry：

$$
H_b=(h_i)_{i\in B_b}
$$

$$
z_b
=
\Phi_\phi(H_b)
=
\Phi_\phi(h_{bm},h_{bm+1},\ldots,h_{bm+m-1})
$$

当前 query 先去这些 block memory 里找相关项：

$$
a_{t,b}=g_\psi(q_t,z_b)
$$

$$
S_t
=
\operatorname{TopK}_k\{a_{t,b}:b\ \text{causally visible to }t\}
$$

然后只对选中的 compressed KV entries 做 attention。

若表述为：

> 这 100 万 token 里只保留 1024 个 token。

该表述会混淆原始 token 与 compressed memory entry。更贴近实际机制的描述是：

> 历史先被压缩为局部摘要；当前 query 从摘要中选择一批读取；最近 token 由 SWA 保持原始粒度；更远处的背景由 HCA 以粗粒度记忆覆盖。

CSA 的访问单位从原始 token 变成压缩记忆块。访问决策也随之转化为：当前 query 是否需要访问该压缩块。

## 2. top-k 近似的成立条件

对于某个 query，完整 attention 的输出是 value 的加权和。核心变量是 attention mass 的分布。

设选中的历史集合是 $S$。先将 full attention 拆成两个部分：选中的 token 和未选中的 token。

$$
o_t
=
\sum_{i\in\mathcal{P}_t}\alpha_{t,i}v_i
=
\sum_{i\in S}\alpha_{t,i}v_i
+
\sum_{i\in\mathcal{P}_t\setminus S}\alpha_{t,i}v_i
$$

选中部分的 attention mass 记为 $A_t(S)$：

$$
A_t(S)=\sum_{i\in S}\alpha_{t,i}
$$

没选中的残余 attention mass 记为 $R_t(S)$：

$$
R_t(S)
=
\sum_{i\in\mathcal{P}_t\setminus S}\alpha_{t,i}
=
1-A_t(S)
$$

进一步将两个部分各自重新归一化。选中部分的平均输出是：

$$
o_S
=
\frac{1}{A_t(S)}
\sum_{i\in S}\alpha_{t,i}v_i
$$

没选中部分的平均输出是：

$$
o_{\bar S}
=
\frac{1}{R_t(S)}
\sum_{i\in\mathcal{P}_t\setminus S}\alpha_{t,i}v_i
$$

将这两个定义代回 full attention：

$$
o_t
=
A_t(S)o_S+R_t(S)o_{\bar S}
$$

再用 $A_t(S)=1-R_t(S)$ 改写：

$$
o_t
=
(1-R_t(S))o_S+R_t(S)o_{\bar S}
$$

如果稀疏 attention 只保留 $S$，近似输出可以写成：

$$
\hat{o}_t=o_S
$$

于是误差一步步展开：

$$
\begin{aligned}
\|o_t-\hat{o}_t\|
&=
\|(1-R_t(S))o_S+R_t(S)o_{\bar S}-o_S\|\\
&=
\|R_t(S)o_{\bar S}-R_t(S)o_S\|\\
&=
R_t(S)\|o_{\bar S}-o_S\|.
\end{aligned}
$$

假设每个 value 的范数都有界：

$$
\|v_i\|\le V
$$

由于 $o_S$ 和 $o_{\bar S}$ 都是 value 的凸组合，因此：

$$
\|o_S\|\le V,\qquad \|o_{\bar S}\|\le V
$$

再用三角不等式：

$$
\begin{aligned}
\|o_t-\hat{o}_t\|
&=
R_t(S)\|o_{\bar S}-o_S\|\\
&\le
R_t(S)(\|o_{\bar S}\|+\|o_S\|)\\
&\le
2V R_t(S).
\end{aligned}
$$

该推导给出一个直接判据：token 或 block 在当前输出中分配到多少 attention mass。

DeepSeek-V4 选的是 compressed block，粒度已经从 token 升到了 block。可以先引入一个中间输出：如果只选这些 block，但仍然读 block 内原始 token，输出记为 $o_t^{\mathrm{raw}\text{-}S}$；实际 CSA 读压缩 entry，输出记为 $o_t^{\mathrm{csa}}$。于是：

$$
\begin{aligned}
o_t-o_t^{\mathrm{csa}}
&=
(o_t-o_t^{\mathrm{raw}\text{-}S})
+
(o_t^{\mathrm{raw}\text{-}S}-o_t^{\mathrm{csa}}).
\end{aligned}
$$

取范数后：

$$
\begin{aligned}
\|o_t-o_t^{\mathrm{csa}}\|
&\le
\|o_t-o_t^{\mathrm{raw}\text{-}S}\|
+
\|o_t^{\mathrm{raw}\text{-}S}-o_t^{\mathrm{csa}}\|\\
&=
\underbrace{\|o_t-o_t^{\mathrm{raw}\text{-}S}\|}_{\text{selection error}}
+
\underbrace{\|o_t^{\mathrm{raw}\text{-}S}-o_t^{\mathrm{csa}}\|}_{\text{compression error}}.
\end{aligned}
$$

于是问题变成两个小问题。

问题一：重要信息是否集中在少数 block 里。许多语言任务满足这一性质。下一 token 往往强依赖最近上下文、当前指令、若干实体和若干证据段，通常不会均匀依赖整整 100 万 token。

问题二：压缩后的 block 是否保留未来 query 需要的特征。DeepSeek-V4 的压缩采用 learned weighted summary。报告里的 CSA 会生成 trainable projection、compression weights 和 positional bias，再通过 softmax 权重合成 compressed entry。该过程比平均池化更细粒度，也更接近神经网络内部的记忆整理。

## 3. top-k 外面的 token 去了哪里

一个 token 在该架构中有几种典型状态。

第一种状态：token 进入某个 compressed KV entry。原 token 虽然没有以独立 KV 的形式留下，但信息仍可能进了 block 摘要。

该 token 所在的 compressed block 可能被 top-k 选中。模型不逐 token 展开该段历史，只读取该 block 的压缩表示。

该 token 也可能未进入 CSA 的候选集合，但仍被 HCA 的全局压缩分支覆盖。HCA 使用更大的压缩率 $m'=128$ 将远程上下文变成更短的全局记忆流，然后在该重压缩序列上做 dense attention。

还有一种情况是：当前 query 对该 token 的使用量确实较低。该判断只在当前层、当前 query、当前 head/分支内成立；下一层、下一个 query 或另一个 head 可能选择不同 block。

因此，“无意义”不适合作为绝对判断。更合适的是局部贡献定义：

> token $i$ 对 query $t$ 在某层是 $\varepsilon$-irrelevant，如果删除、合并或不展开该 token 之后，最终输出分布变化小于 $\varepsilon$。

用 KL divergence 可以写成。先定义 full attention 下的输出分布：

$$
p_t^{\mathrm{full}}(y)
=
p_{\mathrm{full}}(y_t=y\mid x_{\le t})
$$

再定义删除、合并或不展开 token $i$ 后的输出分布：

$$
p_t^{-i}(y)
=
p_{\mathrm{compressed/no}\ i}(y_t=y\mid x_{\le t})
$$

于是 token $i$ 对当前位置预测的影响可以写成：

$$
\Delta_i =
D_{\mathrm{KL}}\left(
p_t^{\mathrm{full}}
\;\|\;
p_t^{-i}
\right)
$$

将 KL 展开到词表 $\mathcal{Y}$ 上：

$$
\Delta_i
=
\sum_{y\in\mathcal{Y}}
p_t^{\mathrm{full}}(y)
\log
\frac{p_t^{\mathrm{full}}(y)}{p_t^{-i}(y)}
$$

如果 $\Delta_i$ 足够小，该 token 对本次预测的贡献就低。该结论不能外推为永久判决。

## 4. top-k 旁边还站着 SWA 和 HCA

仅使用远程 top-k 会丢失局部细节。局部语法、短程引用、当前句子结构、代码缩进、括号匹配等依赖最近 token 的未压缩信息。

因此 DeepSeek-V4 还保留了 Sliding Window Attention。报告给出的理由是：CSA/HCA 的 query 只能 attend 到 preceding compressed blocks，不能访问自己所在压缩块内部的全部细节；语言建模中 recent tokens 往往更相关。因此 V4 额外保留最近 $n_{\mathrm{win}}$ 个未压缩 KV entries 来处理局部依赖。

三条分支的分工如下：

| 分支 | 作用 | 信息形态 |
| --- | --- | --- |
| SWA | 最近上下文细节 | 未压缩 token |
| CSA | 远程重点证据 | 中等压缩 + top-k 检索 |
| HCA | 全局背景/粗摘要 | 重压缩 + dense attention |

该方案没有将全部压力放在 top-k 上。该方案构成一套多分辨率记忆：近处保留高分辨率表示，远处保留压缩表示，需要时再访问最相关的压缩块。

## 5. 训练阶段的适配机制

若对一个只按 full attention 训练的模型在推理阶段临时加入 KV 压缩和 top-k，质量通常会显著下降。原因在于模型没有学习如何将信息写入这种记忆格式，也没有学习如何从这种格式读取信息。

DeepSeek-V4 的压缩器、indexer、attention、后面的 MLP/MoE 是一起训练的。

报告给出的训练路径显示：模型从较短序列开始训练，逐步扩到 16K、64K、1M；稀疏注意力没有从第一阶段启用，前期先做 dense attention warmup；到 64K 阶段再引入 sparse attention，并先 warm up CSA 的 lightning indexer，随后在大部分训练中使用 sparse attention。

这会逼模型学会几件事：

1. 早期层将局部信息写入更容易压缩的 hidden state。
2. 压缩器保留未来 query 可能需要的特征。
3. indexer 根据 query 找相关 block。
4. 后续层适应这种不完整但高效的记忆。

因此，质量来自训练阶段对读取方式的适配。模型从训练时就处在这种记忆访问约束下，内部表示也会随之调整。

## 6. 形式化为优化问题

该机制可以写成一个带 KV/FLOPs 预算的 attention 近似问题。

先写普通语言建模。给定训练样本 $x=(x_1,\ldots,x_T)$，第 $t$ 个位置的目标 token 是 $y_t=x_{t+1}$。full attention 模型的单位置损失是：

$$
\ell_t^{\mathrm{full}}(\theta)
=
-\log p_\theta(y_t\mid x_{\le t})
$$

整段序列的损失是：

$$
\mathcal{L}_{\mathrm{full}}(\theta)
=
\mathbb{E}_{x}
\left[
\sum_{t=1}^{T-1}\ell_t^{\mathrm{full}}(\theta)
\right]
$$

也就是：

$$
\mathcal{L}_{\mathrm{full}}(\theta)
=
\mathbb{E}_{x}
\left[
\sum_{t=1}^{T-1}
-\log p_\theta(y_t\mid x_{\le t})
\right]
$$

加入 KV 预算后，先定义压缩块：

$$
H_b=(h_i)_{i\in B_b}
$$

压缩器给出 compressed entry：

$$
z_b=\Phi_\phi(H_b)
$$

indexer 给每个 block 打分：

$$
a_{t,b}=g_\psi(q_t,z_b)
$$

再选出预算内的 block：

$$
S_t
=
\operatorname{TopK}_k\{a_{t,b}:b\ \text{causally visible to }t\}
$$

对选中的 compressed entries 做 attention。先写 compressed score：

$$
\hat{e}_{t,b}=q_t^\top z_b,\qquad b\in S_t
$$

再写 compressed softmax：

$$
\hat{\alpha}_{t,b}
=
\frac{\exp(\hat{e}_{t,b})}
{\sum_{c\in S_t}\exp(\hat{e}_{t,c})}
$$

于是预算内的 attention 输出是：

$$
\hat{o}_t
=
\sum_{b\in S_t}\hat{\alpha}_{t,b}z_b
$$

将该输出放进语言建模损失：

$$
\ell_t^{\mathrm{sparse}}(\theta,\phi,\psi)
=
-\log p_\theta(y_t\mid x_{\le t};\Phi_\phi,g_\psi)
$$

总目标变成：

$$
\mathcal{L}_{\mathrm{sparse}}(\theta,\phi,\psi)
=
\mathbb{E}_{x}
\left[
\sum_{t=1}^{T-1}
\ell_t^{\mathrm{sparse}}(\theta,\phi,\psi)
\right]
$$

也就是：

$$
\min_{\theta,\phi,\psi}
\mathbb{E}_{x}
\left[
\sum_{t=1}^{T-1}
-\log p_\theta(y_t\mid x_{\le t};\Phi_\phi,g_\psi)
\right]
$$

约束写成：

$$
\mathrm{KVMemory}(\phi,\psi,T)\le M
$$

$$
\mathrm{FLOPs}(\phi,\psi,T)\le C
$$

如果只评估一层的粗略 cache 项，窗口和压缩流会给出：

$$
N_{\mathrm{cache}}
=
n_{\mathrm{win}}
+
\left\lceil\frac{T}{m}\right\rceil
$$

乘上每个 entry 的维度和字节数，就得到这一层的 KV memory 近似：

$$
\mathrm{KVMemory}_{\mathrm{layer}}
\approx
N_{\mathrm{cache}}\cdot d_{\mathrm{kv}}\cdot \mathrm{bytes}
$$

该问题可从三层分析。

### A. Rate-distortion / 信息瓶颈

每个 block 原来有 $m$ 个 token 的 KV，现在只能存一个 vector。可以先写压缩失真：

$$
D_{\mathrm{hidden}}(B_b)
=
\left\|
H_b-\widehat{H}_b(z_b)
\right\|^2
$$

其中，$\widehat{H}_b$ 表示仅使用 $z_b$ 反推 block 信息时的重构结果。更贴近 attention 的失真可以写成：

$$
D_{\mathrm{attn}}(q,B_b)
=
\left\|
\mathrm{Attn}_{\mathrm{raw}}(q,B_b)
-
\mathrm{Attn}_{\mathrm{compressed}}(q,z_b)
\right\|^2
$$

最终训练更关心 next-token loss：

$$
D_{\mathrm{nll}}
=
\ell_t^{\mathrm{sparse}}-\ell_t^{\mathrm{full}}
$$

因此，rate-distortion 版本可以写成：

$$
\min_{\Phi_\phi}
\mathbb{E}
\left[
\lambda_hD_{\mathrm{hidden}}
+
\lambda_aD_{\mathrm{attn}}
+
\lambda_nD_{\mathrm{nll}}
\right]
$$

同时满足：

$$
\mathrm{memory\ rate}(\Phi_\phi)\le \rho
$$

其中，$\lambda_h,\lambda_a,\lambda_n$ 是权重，$\rho$ 是允许的压缩后存储率。

### B. Learned retrieval / 学出来的检索器

top-k 选择可建模为检索问题：给定 query $q_t$，从所有 block memory $z_b$ 里找相关 block。

理想相关性可以用 dense attention 下的 block mass 表示。先将 token-level attention 聚合到 block：

$$
r_{t,b}
=
\sum_{i\in B_b}\alpha_{t,i}
$$

如果所有 block 覆盖可见历史，block mass 还满足：

$$
\sum_b r_{t,b}
=
\sum_b\sum_{i\in B_b}\alpha_{t,i}
=
\sum_{i\in\mathcal{P}_t}\alpha_{t,i}
=
1
$$

oracle top-k 会选择 $r_{t,b}$ 最大的 block：

$$
S_t^{\mathrm{oracle}}
=
\operatorname{TopK}_k\{r_{t,b}\}_b
$$

实际 indexer 要学一个更便宜的打分函数：

$$
a_{t,b}
=
g_\psi(q_t,z_b)
$$

训练目标要求该分数排序接近 oracle 排序：

$$
\operatorname{rank}(a_{t,b})
\approx
\operatorname{rank}(r_{t,b})
$$

### C. End-to-end loss minimization

最终目标仍然是生成质量。某个 block 在 dense attention 中具有非零质量，并不意味着该 block 一定需要进入预算集合；如果移除该 block 后最终 token 分布变化很小，预算可以分配给剩余 block。

更贴近训练目标的标准是。先定义两个输出分布：

$$
p_t^{\mathrm{full}}(y)
=
p_{\mathrm{full}}(y_t=y\mid x_{\le t})
$$

$$
p_t^{\mathrm{sparse}}(y)
=
p_{\mathrm{sparse\text{-}compressed}}(y_t=y\mid x_{\le t})
$$

分布差异可以写成：

$$
D_{\mathrm{KL}}
\left(
p_t^{\mathrm{full}}
\;\|\;
p_t^{\mathrm{sparse}}
\right)
$$

展开到词表：

$$
D_{\mathrm{KL}}
\left(
p_t^{\mathrm{full}}
\;\|\;
p_t^{\mathrm{sparse}}
\right)
=
\sum_{y\in\mathcal{Y}}
p_t^{\mathrm{full}}(y)
\log
\frac{p_t^{\mathrm{full}}(y)}{p_t^{\mathrm{sparse}}(y)}
$$

或者直接使用负对数似然差：

$$
\Delta \mathrm{NLL}
=
-\log p_{\mathrm{sparse}}(y_t)
+
\log p_{\mathrm{full}}(y_t)
$$

单步损失差可以写为：

$$
\Delta \mathrm{NLL}
=
\ell_t^{\mathrm{sparse}}
-
\ell_t^{\mathrm{full}}
$$

## 7. 选择质量评估

CSA/HCA 的近似质量可通过几类信号分析。

### 1. Captured Attention Mass

在较短 context 上运行 full attention，得到 dense attention mass，再将 token-level mass 聚合到 block：

$$
r_{t,b}
=
\sum_{i\in B_b}\alpha_{t,i}
$$

然后计算模型 indexer 选出的 block 捕获了多少 mass：

$$
\mathrm{CapturedMass@k}
=
\sum_{b\in S_t}r_{t,b}
$$

将 $r_{t,b}$ 展开：

$$
\mathrm{CapturedMass@k}
=
\sum_{b\in S_t}
\sum_{i\in B_b}\alpha_{t,i}
$$

未捕获部分可写为：

$$
\mathrm{MissedMass@k}
=
1-\mathrm{CapturedMass@k}
$$

CapturedMass@k 越高，top-k 在该数据分布下越接近 dense attention 的主要质量分布。

### 2. Oracle top-k vs learned top-k

比较 oracle selection：

$$
S_t^{\mathrm{oracle}}
=
\operatorname{TopK}_k\{r_{t,b}\}_b
$$

和 model selection：

$$
a_{t,b}=g_\psi(q_t,z_b)
$$

$$
S_t^{\mathrm{model}}
=
\operatorname{TopK}_k\{a_{t,b}\}_b
$$

Recall@k 可定义为：

$$
\mathrm{Recall@k}
=
\frac{|S_t^{\mathrm{oracle}}\cap S_t^{\mathrm{model}}|}
{|S_t^{\mathrm{oracle}}|}
$$

如果两个集合大小都是 $k$：

$$
\mathrm{Recall@k}
=
\frac{|S_t^{\mathrm{oracle}}\cap S_t^{\mathrm{model}}|}
{k}
$$

报告中提到，CSA indexer 的 QK path 使用 FP4、index scores 从 FP32 量化到 BF16 后，top-k selector 获得 2x 加速，同时保持 99.7% 的 KV entry recall。该 recall 验证的是“低精度加速后选出的 KV entry 是否接近原 selector”，不能直接推出 sparse attention 和 full attention 完全等价。

### 3. Compression distortion

对于某个 block，可以比较原始 token attention 与压缩 entry attention 的输出差异：

$$
e_i^{B}=q^\top k_i,\qquad i\in B_b
$$

$$
\alpha_i^{B}
=
\frac{\exp(e_i^{B})}
{\sum_{\ell\in B_b}\exp(e_\ell^{B})}
$$

$$
\mathrm{Attn}_{\mathrm{raw}}(q,B_b)
=
\sum_{i\in B_b}\alpha_i^{B}v_i
$$

压缩路径先将该 block 变成 $z_b$，再用 $z_b$ 作为可读的 compressed memory。若评估单个 block 的表达误差，可以写成：

$$
\mathrm{Attn}_{\mathrm{compressed}}(q,z_b)
=
z_b
$$

于是 block-level distortion 是：

$$
D_b(q)
=
\left\|
\mathrm{Attn}_{\mathrm{raw}}(q,B_b)
-
\mathrm{Attn}_{\mathrm{compressed}}(q,z_b)
\right\|
$$

代入前面的定义：

$$
D_b(q)
=
\left\|
\sum_{i\in B_b}
\frac{\exp(q^\top k_i)}
{\sum_{\ell\in B_b}\exp(q^\top k_\ell)}
v_i
-
z_b
\right\|
$$

差异越小，说明 compressed entry 对当前 query 的表达越充分。

### 4. Ablation 曲线

改变 $m,k,m',n_{\mathrm{win}}$，评估 perplexity、LongBench、needle-in-haystack、多证据问答、代码任务的变化。通常会得到一条 Pareto curve：

$$
\mathrm{cost}(m,k,m',n_{\mathrm{win}})
=
\mathrm{KVMemory}(m,m',n_{\mathrm{win}})
+
\lambda\,\mathrm{FLOPs}(k,n_{\mathrm{win}})
$$

$$
\mathrm{quality}(m,k,m',n_{\mathrm{win}})
=
-\mathrm{NLL}(m,k,m',n_{\mathrm{win}})
$$

$$
\mathrm{Pareto}
=
\left\{
(c,q):
\nexists(c',q')\ \text{with}\ c'\le c,\ q'\ge q,\ (c',q')\ne(c,q)
\right\}
$$

报告中，LongBench-V2 上 DeepSeek-V3.2-Base 为 40.2，V4-Flash-Base 为 44.7，V4-Pro-Base 为 51.5。该结果说明 V4 系列在长上下文评测上更强，但提升不能全部归因于 CSA/HCA；数据、规模、训练策略和优化器也发生了变化。

### 5. Adversarial / worst-case 测试

最易暴露稀疏检索问题的是必须均匀读取全文的任务：

1. 统计全文某个词出现次数。
2. 比较 1000 个分散证据。
3. 每段都有一个小事实，最终答案依赖全部事实。
4. needle 较短，且和 query 的语义相关性较弱。
5. 需要逐 token 精确复原。

此类任务会挑战“少数 top-k block 足够”的前提。HCA 可以保留部分全局 aggregate；当任务要求精确保留所有细节时，压缩会产生信息损失。

## 8. DeepSeek-V4 押了哪些经验判断

该设计背后的经验判断可拆成几条：

1. 远程依赖通常比较稀疏。百万 token 里，对当前生成真正有用的远程片段往往只有一小部分。
2. 局部依赖重要。最近 token 需要原样保留，对应 SWA 的位置。
3. 远处信息有相当一部分可以摘要化。模型不一定需要每个 token 的完整 KV，只需要面向未来 query 的 memory representation。
4. 训练能让模型适应这种记忆格式。V4 在长上下文训练中逐步引入 sparse attention，并 warm up indexer，记忆格式从训练阶段就进入模型能力边界。
5. 真实任务分布通常避开最坏情况。如果输入任务必须均匀读取全上下文，top-k sparse attention 的近似误差会增大。

## 9. 官方 inference 源码路径

前文提供了机制层面的解释。DeepSeek-V4 官方 Hugging Face 仓库里的 `inference/model.py` 和 `inference/kernel.py`，能够将该机制对应到具体读写路径。

需要限定分析范围：`inference` 目录是官方本地推理实现，适合观察推理时如何读取 KV cache；训练细节和线上服务端的完整工程实现需要补充资料。模型卡将本地运行入口指向 `inference` 文件夹，仓库和模型权重是 MIT license。

### 9.1 配置决定层级读取路径

`ModelArgs` 里的小默认配置有几个醒目的字段：

```python
window_size = 128
compress_ratios = (0, 0, 4, 128, 4, 128, 4, 0)
index_topk = 512
```

这只是默认/示例参数。真实 V4-Pro 的 `config.json` 写得更大：最大位置是 `1048576`，`sliding_window` 是 `128`，`index_topk` 是 `1024`，`compress_ratios` 里混着 `4`、`128`，最后还有一个 `0`。

这三个 ratio 可以直接读成三种层：

| ratio | 历史读取路径 |
| --- | --- |
| `4` | c4a/CSA，先 4 倍附近压缩，再用 learned indexer 选 top-k |
| `128` | c128a/HCA，重压缩后读可见 compressed stream |
| `0` | 只保留 sliding window，不走远程压缩 |

源码也按该逻辑分叉：`compress_ratio == 4` 才创建 `Indexer`；非 c4a 压缩层没有 learned indexer。到了 forward，如果有 indexer 就走 learned top-k；如果没有，就生成所有因果可见的 compressed positions。

### 9.2 Compressor 做的是 learned gated pooling

`Compressor` 的注释直接说明：`Compressor` 通过 learned gated pooling 压缩 KV cache。代码路径可简化为：

```python
kv = self.wkv(x)
score = self.wgate(x)
kv = (kv * score.softmax(dim=2)).sum(dim=2)
```

中间还有 reshape、`ape` 位置偏置、overlap 处理和 RMSNorm。对应公式可以分四步。

第一步，先生成候选 KV：

$$
u_r=W_{kv}h_r
$$

第二步，生成 gate 分数：

$$
s_r=W_{\mathrm{gate}}h_r
$$

第三步，加上压缩块内部的位置偏置。若 $r\in B_j$，将 $r$ 在 block 内的位置写成 $\rho(r)$：

$$
\tilde{s}_r=s_r+a_{\rho(r)}
$$

第四步，在 block 内做按维度 softmax。对第 $d$ 个维度：

$$
\beta_{r,d}
=
\frac{\exp(\tilde{s}_{r,d})}
{\sum_{\ell\in B_j}\exp(\tilde{s}_{\ell,d})}
$$

于是压缩前的加权和是：

$$
\bar{z}_{j,d}
=
\sum_{r\in B_j}\beta_{r,d}u_{r,d}
$$

向量写法就是：

$$
 \bar{z}_j
=
\sum_{r\in B_j}
\beta_r\odot u_r
$$

最后过归一化：

$$
z_j=\mathrm{Norm}(\bar{z}_j)
$$

合并四步：

$$
z_j
=
\mathrm{Norm}\left(
\sum_{r\in B_j}
\mathrm{softmax}_{r\in B_j}(W_{\mathrm{gate}}h_r+a_{\rho(r)})
\odot
W_{kv}h_r
\right)
$$

其中，$B_j$ 是第 $j$ 个压缩块，$W_{kv}h_r$ 对应 `wkv(x)`，$W_{\mathrm{gate}}h_r$ 对应 `wgate(x)`，$a_{\rho(r)}$ 对应 `ape`。该 gate 按维度作用，不只是一个 scalar 权重。

因此，源码里的压缩可视为“为后续 attention 准备一个 KV 摘要向量”。vLLM 的解读也提到，`c4a` 近似为 1/4 压缩，一个 compressed token 来自 8 个 uncompressed tokens 的加权和，stride 是 4；`c128a` 则是 128 个 token 压缩为 1 个，stride 是 128。

这也解释了 top-k 外 token 的去处：大量信息已经写入 compressed KV entry。

### 9.3 decode 时凑到边界才写 compressed cache

生成阶段不会每来一个 token 就立刻写一个长期 compressed entry。源码先将当前 token 的候选 KV 和 gate 分数放进 `kv_state` / `score_state`；只有到压缩边界，才将这一组状态合成一个 compressed KV 写入 cache。

该逻辑可简化为：

```python
if boundary_reached:
    kv = weighted_pool(kv_state, score_state)
    compressed_cache[block_id] = kv
```

因此，KV cache 节省来自长期 cache 的存储对象变化：长期 cache 存储压缩块；尚未凑满一个压缩块的尾部 token 暂存在 state cache 和 sliding window 中。

### 9.4 top-k 是单独的 learned indexer

`Indexer` 自身包含 query projection 和用于打分的 compressed KV。源码注释说明：`Indexer` 通过 learned scoring 为 sparse attention 选择 top-k compressed KV positions，并且有自己的 `Compressor` 来构建 indexer 专用压缩 KV。

核心打分可以简化成：

先做 indexer 的 query projection：

$$
q^{idx}_{t,h}=W^{idx}_{q,h}q_t
$$

indexer 自己的 compressor 给出索引用的 compressed KV：

$$
z^{idx}_j=\Phi^{idx}(H_j)
$$

每个 head 先算一个相似度：

$$
u_{t,h,j}
=
q^{idx}_{t,h}\cdot z^{idx}_j
$$

源码对该相似度做 ReLU：

$$
\tilde{u}_{t,h,j}
=
\mathrm{ReLU}(u_{t,h,j})
$$

再乘上 query 侧学出来的 head 权重 $w_{t,h}$：

$$
\bar{s}_{t,h,j}
=
w_{t,h}\tilde{u}_{t,h,j}
$$

最后跨 head 求和：

$$
s_{t,j} =
\sum_h
w_{t,h}\cdot
\mathrm{ReLU}\left(
q^{idx}_{t,h}\cdot z^{idx}_j
\right)
$$

然后：

$$
S_t
=
\operatorname{TopK}_k\{s_{t,j}\}_j
$$

该路径有两个重要含义。

第一，top-k 的位置在 dense attention 之前。该路径使用一个便宜检索器，先预测哪些 compressed blocks 值得读。

第二，top-k 只发生在 `compress_ratio == 4` 的层。`c128a` 层压缩率更高，1M token 变成约 8192 个 compressed entries，可以直接读可见压缩流。vLLM 也将该机制解释为：`c4a` 后还有约 250K compressed tokens，因此需要 DSA top-k；`c128a` 后最多约 8K compressed tokens，计算上可以承受。

### 9.5 SWA 和 compressed indices 会拼到一起

`Attention.forward` 里先拿最近窗口：

```python
topk_idxs = get_window_topk_idxs(...)
```

如果这一层有压缩，再拼接远程 compressed indices：

```python
topk_idxs = torch.cat([topk_idxs, compress_topk_idxs], dim=-1)
```

因此，每层实际送进 sparse attention kernel 的索引，是近邻原始 KV 加远程压缩 KV 的并集。先写本地窗口：

$$
\mathcal{I}_{\mathrm{local}}(t)
=
\{i:\max(0,t-n_{\mathrm{win}})\le i<t\}
$$

再写远程压缩位置。对 c4a 层：

$$
\mathcal{I}_{\mathrm{remote}}^{c4a}(t)
=
S_t
$$

对 c128a 层：

$$
\mathcal{I}_{\mathrm{remote}}^{c128a}(t)
=
\{b:b\ \text{is a completed and visible compressed block at }t\}
$$

最终读集合是：

$$
\mathcal{I}_{\mathrm{attn}}(t)
=
\mathcal{I}_{\mathrm{local}}(t)
\cup
\mathcal{I}_{\mathrm{remote}}(t)
$$

对 c4a 层，远程 compressed KV 会先经过 learned top-k。对 c128a 层，远程 compressed KV 基本是所有因果可见的压缩项。对 ratio 为 0 的层，只有 sliding window。

### 9.6 sparse kernel 只读 index 指到的 KV row

`kernel.py` 里的 `sparse_attn_kernel` 注释说明：该 kernel 根据 index gather top-k KV positions，然后做 online softmax 风格的 attention。

简化后就是：

```python
idx = topk_idxs(...)
kv_row = kv[idx]
score = q @ kv_row.T
out = softmax(score) @ kv_row
```

写成数学步骤，先根据 index 集合取出 KV row：

$$
\mathcal{I}_{\mathrm{attn}}(t)
=
\{i_1,i_2,\ldots,i_K\}
$$

$$
\tilde{v}_a=\mathrm{KVCache}[i_a],
\qquad a=1,\ldots,K
$$

然后算 kernel 内的 attention score：

$$
\tilde{e}_{t,a}
=
q_t^\top \tilde{v}_a
$$

再做 softmax：

$$
\tilde{\alpha}_{t,a}
=
\frac{\exp(\tilde{e}_{t,a})}
{\sum_{c=1}^{K}\exp(\tilde{e}_{t,c})}
$$

最后得到输出：

$$
\tilde{o}_t
=
\sum_{a=1}^{K}\tilde{\alpha}_{t,a}\tilde{v}_a
$$

该 kernel 路径说明：未进入 `topk_idxs` 的 KV row，在一次 attention 中不会被读取。其中，`kv` 是共享 K/V 表示；kernel 先使用该表示计算 score，再用同一个表示形成输出，后续还会对 RoPE 维度做 inverse rotation。

### 9.7 cache 在源码里是分区的

`Attention.__init__` 里按窗口和压缩长度分配 cache：

```python
kv_cache_size = window_size + max_seq_len // compress_ratio
```

随后将 `kv_cache` 的前半段留给 sliding window，将 `win:` 之后的区域交给 compressor：

```python
compressor.kv_cache = kv_cache[:, win:]
```

decode 时，最近 token 写入 ring buffer；compressed KV 到边界后写入压缩数组。因此，每个压缩层的 KV cache 可表示为：

$$
N_{\mathrm{SWA}}
=
n_{\mathrm{win}}
$$

$$
N_{\mathrm{compressed}}
=
\left\lceil\frac{T}{m}\right\rceil
$$

$$
N_{\mathrm{cache}}
=
N_{\mathrm{SWA}}
+
N_{\mathrm{compressed}}
=
n_{\mathrm{win}}
+
\left\lceil\frac{T}{m}\right\rceil
$$

如果一个 KV entry 的维度是 $d_{\mathrm{kv}}$，存储精度是 $b_{\mathrm{bytes}}$ 字节，那么单层 cache 近似为：

$$
\mathrm{Mem}_{\mathrm{layer}}
\approx
\left(
n_{\mathrm{win}}
+
\left\lceil\frac{T}{m}\right\rceil
\right)
d_{\mathrm{kv}}b_{\mathrm{bytes}}
$$

vLLM 给出一个 1M context 估算：bf16 KV cache 下，DeepSeek V4 单序列约 9.62 GiB；对比 61 层 DeepSeek-V3.2 风格栈的 83.9 GiB，约降低 8.7 倍。实际部署还可以用 FP4 indexer cache 和 FP8 attention cache 继续降低占用。

### 9.8 因果性靠 mask 和边界条件守住

压缩 attention 最容易出现错误的位置，是 compressed block 混入未来 token。源码依赖两类约束避免该问题。

一类是普通 compressed index 的 mask：不可见的 compressed index 会被写成 `-1`。

另一类是 learned indexer 的 mask：prefill 时对未来 compressed block 加 `-inf`，top-k 之后再将非法位置置为 `-1`。

vLLM 的位置解释为：`c4a` 的第 $j$ 个 compressed token 聚合大约 $[4j-4,4j+3]$ 的范围，query 只有到 $i\ge 4j+3$ 才可见；`c128a` 则需要 $i\ge 128j+127$。SWA 的必要性来源于该边界条件：压缩块完成前，当前 query 仍需要读取本地历史。

将该因果条件写成通用形式。若第 $j$ 个 compressed block 覆盖的最后一个原始 token 是：

$$
e_j=\max B_j
$$

当前位置 $t$ 能读取该 block 的条件是：

$$
t\ge e_j
$$

对 c4a 的 overlap 近似，vLLM 给出的末端位置是：

$$
e_j^{c4a}=4j+3
$$

因此可见条件是：

$$
t\ge 4j+3
$$

对 c128a：

$$
e_j^{c128a}=128j+127
$$

因此可见条件是：

$$
t\ge 128j+127
$$

### 9.9 源码路径的最小伪代码

官方实现可简化为：

```python
def deepseek_v4_attention(x, start_pos, layer):
    q = make_query_with_rope(x)
    kv_raw = make_raw_kv_with_rope(x)

    local_idxs = sliding_window_indices(start_pos, win=128)

    if layer.compress_ratio == 4:
        remote_idxs = learned_indexer_topk(x, q)
    elif layer.compress_ratio == 128:
        remote_idxs = all_visible_compressed_indices()
    else:
        remote_idxs = []

    write_raw_kv_to_swa_ring(kv_raw)
    maybe_write_compressed_kv(x, layer.compress_ratio)

    return sparse_attention(q, kv_cache, local_idxs + remote_idxs)
```

这段伪代码比源码少了量化、RoPE 细节、overlap、RMSNorm、分布式 all-reduce 和 kernel 优化，但保住了主干：query 先决定读哪些位置，cache 同时维护短窗口和压缩流，kernel 只 gather 被选中的 KV row。

### 9.10 源码给出的六个结论

基于 inference 源码，可进一步得到以下结论：

1. DeepSeek-V4 通过 `Compressor` 将多个 token 的 KV 合成 learned weighted summary；c4a 还带 overlap。
2. learned top-k 只出现在 c4a 层。`compress_ratio == 4` 创建 `Indexer`；`compress_ratio == 128` 读可见 compressed entries。
3. top-k 选择的是 compressed memory block，粒度已经从原始 token 升到压缩块。
4. 最近 128 个 token 仍以未压缩形式留在 SWA 里。
5. 省显存来自 cache 形态变化：全量 raw KV 变成短窗口 raw KV、sequence-compressed KV，以及 c4a indexer cache。
6. 源码展示的是推理瓶颈的实现方式；质量依赖训练阶段让压缩器、indexer、attention 后续层一起适应这种记忆格式。

## 10. 总结

DeepSeek-V4 的 KV 压缩可以总结为：

> 在给定生成位置上，大多数历史 token 不需要以原始 KV 形式逐个读取；这些 token 可由局部摘要表示，或者对当前 query 的贡献不足以占用预算，或者由全局压缩分支覆盖。真正要优化的是在 KV/FLOPs 预算下，让 next-token loss 尽量接近 full attention。

该机制可以整理为如下流程。先有长上下文 hidden states：

$$
H_{1:T}=(h_1,h_2,\ldots,h_T)
$$

再按 block 压缩：

$$
z_b=\Phi_\phi(H_b)
$$

当前 query 做预算内检索：

$$
S_t=\operatorname{TopK}_k\{g_\psi(q_t,z_b)\}_b
$$

然后在选中的 memory 上汇聚：

$$
\hat{o}_t
=
\mathrm{Attn}(q_t,\{z_b:b\in S_t\})
$$

最后用 next-token loss 训练整套读取方式：

$$
\mathcal{L}
=
\mathbb{E}_{x}
\left[
\sum_t
-\log p_\theta(y_t\mid \hat{o}_t)
\right]
$$

合在一起就是：

$$
\boxed{
\mathrm{long\text{-}context\ attention}
=
\mathrm{budgeted\ retrieval}
+
\mathrm{learned\ compression}
+
\mathrm{end\text{-}to\text{-}end\ loss\ minimization}
}
$$

top-k 的作用是判断当前 query 是否应当为某个 memory block 分配读取预算。
