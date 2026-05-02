---
title: '注意力机制中的 Index：从位置下标到预算检索'
description: '从普通 attention 的位置索引、DeepSeek 的 lightning indexer 和 GLM-5/5.1 的 DSA index 配置出发，将 index 理解为读写地址、相关性打分、top-k 路由和训练约束的组合问题。'
publishDate: '2026-05-02'
tags: ['ai', 'transformer', 'attention', 'deepseek', 'glm']
language: 'zh-CN'
draft: true
---

注意力机制里的 index 常被简化为如下判断：

> index 就是 token 的位置；做 top-k index，就是找出最重要的 token。

该判断省略了地址、打分、选择集合、cache 行和训练目标之间的分工。

更合适的建模方式是：attention 中的 index 包含一组从“可见历史位置”到“实际读取 KV row”的映射。普通 dense attention 里的 index 只是坐标；DeepSeek Sparse Attention 里的 indexer 是一个 learned retrieval module；GLM-5 里的 `index_topk` 则是把这种 learned retrieval 接到 MLA/DSA 实现中的预算参数。

可以概括为：

> 位置 index 定义可见历史，score index 估计相关性，top-k index 决定实际读取。

需要注意的是，被 top-k index 排除的 token 不等于永久无意义。它只是在**当前层、当前 query、当前 indexer、当前预算**下，没有进入本次 sparse attention 的读取集合。

本文主要参考 [DeepSeek-V3.2 技术报告](https://arxiv.org/abs/2512.02556)、[DeepSeek-V4 技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash/blob/main/DeepSeek_V4.pdf)、[GLM-5 技术报告](https://arxiv.org/abs/2602.15763)、[GLM-5 Hugging Face 配置](https://huggingface.co/zai-org/GLM-5/blob/main/config.json)、[GLM-5.1 Hugging Face 配置](https://huggingface.co/zai-org/GLM-5.1/blob/main/config.json)、Hugging Face Transformers 的 [GlmMoeDsa 文档](https://huggingface.co/docs/transformers/model_doc/glm_moe_dsa) 和 [实现源码](https://github.com/huggingface/transformers/blob/main/src/transformers/models/glm_moe_dsa/modeling_glm_moe_dsa.py)。另参考 [IndexCache](https://arxiv.org/abs/2603.12201) 对跨层 index 复用的分析。

## 符号表

| 符号 | 含义 |
| --- | --- |
| $t$ | 当前 query token 的位置 |
| $i,s,r$ | 历史 token、KV row 或 compressed block 的下标 |
| $\ell$ | Transformer 层下标 |
| $\mathcal{P}_t$ | query $t$ 可见的历史位置集合 |
| $h_t$ | 位置 $t$ 的 hidden state |
| $q_t,k_s,v_s$ | 主 attention 使用的 query、key、value |
| $c_s$ | MLA 中第 $s$ 个 latent KV entry |
| $e_{t,s}$ | 主 attention 的原始打分 |
| $\alpha_{t,s}$ | 主 attention 的 softmax 权重 |
| $o_t,u_t$ | attention 输出 |
| $I_{t,s}$ | indexer 给 query $t$ 与候选 $s$ 的 index score |
| $S_t$ | query $t$ 选中的 top-k 候选集合 |
| $k_{\mathrm{idx}}$ | indexer 的 top-k 预算 |
| $H^I,n_h^I$ | indexer head 数 |
| $d_I,c_I$ | indexer head dimension |
| $m$ | CSA 的压缩率，DeepSeek-V4 里典型值是 4 |
| $m'$ | HCA 的压缩率，DeepSeek-V4 里典型值是 128 |
| $n_{\mathrm{win}}$ | sliding window 长度 |
| $C_s^{\mathrm{Comp}}$ | 第 $s$ 个 compressed KV entry |
| $K_s^{I\mathrm{Comp}}$ | indexer 使用的 compressed key |
| $\mathcal{I}_{\mathrm{attn}}(t)$ | sparse kernel 实际读取的 KV index 集合 |
| $p_{t,:}$ | dense attention 聚合后给 indexer 的目标分布 |
| $D_{\mathrm{KL}}$ | KL divergence |

## 1. 普通 Attention 里的 Index 是地址

完整 causal attention 先定义当前位置 $t$ 的可见历史：

$$
\mathcal{P}_t=\{s:0\le s<t\}
$$

这里的 $s$ 只是历史 token 的位置 index。它回答的问题是：当前位置 $t$ 可以看哪些历史位置。

主 attention 先对每个可见位置打分：

$$
e_{t,s}=q_t^\top k_s,\qquad s\in\mathcal{P}_t
$$

然后在所有可见历史位置上做 softmax：

$$
\alpha_{t,s}
=
\frac{\exp(e_{t,s})}
{\sum_{r\in\mathcal{P}_t}\exp(e_{t,r})}
$$

最后读取所有可见 value：

$$
o_t
=
\sum_{s\in\mathcal{P}_t}
\alpha_{t,s}v_s
$$

在 dense attention 里，index $s$ 不负责判断“重要还是不重要”。它只是 KV cache 里某一行的地址。是否重要由 $\alpha_{t,s}$ 表达，但即使某个 $\alpha_{t,s}$ 很小，该位置仍然参与了 softmax 分母和加权求和。

因此，普通 attention 里至少有三种不同对象：

| 对象 | 形式 | 作用 |
| --- | --- | --- |
| 位置 index | $s$ | 指向某个历史位置 |
| attention score | $e_{t,s}$ | 计算 query 和 key 的相似度 |
| attention weight | $\alpha_{t,s}$ | 决定 value 的加权比例 |

若表述为：

> attention index 表示 token 的重要性。

该表述会混淆“地址”和“贡献”。更准确的说法是：

> dense attention 的 index 是可见历史的坐标；token 对输出的贡献由 score、softmax、value 内容和后续层共同决定。

## 2. Sparse Attention 让 Index 变成预算内读取集合

当上下文长度变大，dense attention 的主要问题在于每个 query 都要读取太多 index。长度为 $L$ 时，主 attention 的成对打分规模是：

$$
O(L^2)
$$

如果每个 query 只读取 $k_{\mathrm{idx}}$ 个候选，主 attention 的核心计算可以降为：

$$
O(Lk_{\mathrm{idx}})
$$

这时需要额外引入一个 indexer。它先给每个候选位置一个便宜的 index score：

$$
I_{t,s}=g_\psi(h_t,h_s)
$$

然后选择 top-k：

$$
S_t
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\{I_{t,s}:s\in\mathcal{P}_t\}
$$

sparse attention 只在 $S_t$ 上做主 attention：

$$
\hat{\alpha}_{t,s}
=
\frac{\exp(q_t^\top k_s)}
{\sum_{r\in S_t}\exp(q_t^\top k_r)},
\qquad s\in S_t
$$

输出变成：

$$
\hat{o}_t
=
\sum_{s\in S_t}
\hat{\alpha}_{t,s}v_s
$$

于是 index 的语义发生变化。$s$ 仍然是地址，但 $S_t$ 是一个预算内读取集合。kernel 里的 gather 操作会按 $S_t$ 取 KV row：

$$
\mathcal{I}_{\mathrm{attn}}(t)=S_t
$$

这一步已经超出数学记号变化，进入系统行为：未进入 $\mathcal{I}_{\mathrm{attn}}(t)$ 的 KV row，本次 kernel 不会读取。

## 3. Top-k Index 近似的成立条件

为了看清 top-k index 在近似什么，可以先把 full attention 输出拆成选中集合和未选中集合：

$$
o_t
=
\sum_{s\in S_t}\alpha_{t,s}v_s
+
\sum_{s\in\mathcal{P}_t\setminus S_t}\alpha_{t,s}v_s
$$

选中集合的 full-attention mass 写成：

$$
A_t(S_t)
=
\sum_{s\in S_t}\alpha_{t,s}
$$

未选中的残余 mass 写成：

$$
R_t(S_t)
=
\sum_{s\in\mathcal{P}_t\setminus S_t}\alpha_{t,s}
=
1-A_t(S_t)
$$

将选中部分和未选中部分各自归一化：

$$
o_{S}
=
\frac{1}{A_t(S_t)}
\sum_{s\in S_t}\alpha_{t,s}v_s
$$

$$
o_{\bar S}
=
\frac{1}{R_t(S_t)}
\sum_{s\in\mathcal{P}_t\setminus S_t}\alpha_{t,s}v_s
$$

于是 full attention 可以写成：

$$
o_t
=
A_t(S_t)o_S+R_t(S_t)o_{\bar S}
$$

如果 sparse attention 近似读成 $\hat{o}_t=o_S$，则误差为：

$$
\begin{aligned}
\|o_t-\hat{o}_t\|
&=
\|A_t(S_t)o_S+R_t(S_t)o_{\bar S}-o_S\|\\
&=
\|(1-R_t(S_t))o_S+R_t(S_t)o_{\bar S}-o_S\|\\
&=
R_t(S_t)\|o_{\bar S}-o_S\|.
\end{aligned}
$$

假设 value 范数有界：

$$
\|v_s\|\le V
$$

由于 $o_S$ 和 $o_{\bar S}$ 都是 value 的凸组合：

$$
\|o_S\|\le V,\qquad \|o_{\bar S}\|\le V
$$

再用三角不等式：

$$
\begin{aligned}
\|o_t-\hat{o}_t\|
&=
R_t(S_t)\|o_{\bar S}-o_S\|\\
&\le
R_t(S_t)(\|o_{\bar S}\|+\|o_S\|)\\
&\le
2V R_t(S_t).
\end{aligned}
$$

该推导给出一个直接判据：top-k index 是否捕获了 full attention 的主要质量。如果未捕获 mass 很小，稀疏读取更可能接近 dense attention。

但该判据仍然只是中间信号。语言模型真正优化的是 next-token loss；单层 attention mass 只是帮助 indexer 对齐 dense attention 的训练信号。因此，后面的训练会让 indexer 同时接近 dense attention 分布，并让主模型适应这种读取方式。

## 4. DeepSeek-V3.2 的 Index：Token-Level Lightning Indexer

DeepSeek-V3.2 的 DSA 将 index 从普通位置下标升级为一个 learned score field。报告给出的 DSA 原型包括两部分：

1. lightning indexer：给 query 和历史 token 计算 index score。
2. fine-grained token selection：按 index score 取 top-k KV entries。

对于 query token $h_t$ 和历史 token $h_s$，indexer score 写成：

$$
I_{t,s}
=
\sum_{j=1}^{H^I}
w_{t,j}^{I}\cdot
\mathrm{ReLU}
\left(
q_{t,j}^{I}\cdot k_s^{I}
\right)
$$

其中，$H^I$ 是 indexer head 数；$q_{t,j}^I$ 和 $w_{t,j}^I$ 来自 query token $h_t$；$k_s^I$ 来自历史 token $h_s$。ReLU 作用在 index score 的便宜打分路径上，给检索分数提供非负激活；主 attention 仍然沿用自己的 score 和 softmax。

给定所有 index score：

$$
I_{t,:}=(I_{t,0},I_{t,1},\ldots,I_{t,t-1})
$$

选择集合为：

$$
S_t
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\{I_{t,s}:s<t\}
$$

DSA 再只读取这些位置对应的 MLA latent KV entry：

$$
u_t
=
\mathrm{Attn}
\left(
h_t,\{c_s:s\in S_t\}
\right)
$$

这一组公式可以从记忆接口角度重写：

$$
\text{write}:h_s\mapsto c_s^{KV},
\qquad
\text{read}:h_t\xrightarrow{\mathrm{indexer}}S_t
\xrightarrow{\mathrm{core\ attention}}u_t.
$$

核心思想是：历史 token 仍完整写入 cache，读取阶段额外插入一个廉价 indexer，把主 attention 的读取范围从完整前缀收缩到 top-k 集合。被省掉的是昂贵主 attention 对所有 KV entry 的精算，历史本身没有在写入阶段消失。

这也解释了 DSA 和固定滑窗的差别。固定滑窗的选择集合只依赖位置：

$$
S_t^{\mathrm{SWA}}
=
\{s:t-w<s<t\}
$$

DSA 的选择集合依赖当前 query、历史 memory 和 indexer 参数：

$$
S_t^{\mathrm{DSA}}
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\left(
I(h_t,M_{t-1})
\right)
$$

固定滑窗把“近处更重要”写成结构先验；DSA 则允许远处证据通过内容匹配进入读取预算。

把数据流拆开，V3.2 的 DSA 可以写成六步：

1. 用 MLA 写入每个历史 token 的 latent KV。
2. 对当前 query token 生成 indexer query $q_{t,j}^{I}$ 与权重 $w_{t,j}^{I}$。
3. 对全部历史位置 $s<t$ 计算索引分数 $I_{t,s}$。
4. 取 top-k 得到 $S_t$。
5. 仅在 $S_t$ 上执行主 attention。
6. 训练时先用 dense warm-up 对齐索引分布，再做 sparse adaptation。

DeepSeek-V3.2 在 MLA 下实例化 DSA，没有采用在普通 MHA 旁边硬塞稀疏 mask 的路径。报告说明，每个 latent vector，也就是 MLA 的 key-value entry，会被 query token 的所有 query heads 共享。这更接近 MQA 模式，有利于 kernel 层共享读取。

### 4.1 Dense warm-up 阶段

DeepSeek-V3.2 避免让 indexer 从随机状态直接控制读取集合。第一阶段先保持 dense attention，并冻结除 lightning indexer 以外的模型参数。

对第 $t$ 个 query，先从主 attention 得到各 head 的 attention 分布。把这些分布按 head 求和，并沿序列维度做 L1 归一化，得到目标分布：

$$
p_{t,:}\in\mathbb{R}^{t}
$$

indexer 自己的分布是：

$$
\pi^I_{t,:}
=
\mathrm{Softmax}(I_{t,:})
$$

训练目标是让 indexer 分布贴近主 attention 聚合分布：

$$
\mathcal{L}_I
=
\sum_t
D_{\mathrm{KL}}
\left(
p_{t,:}
\;\|\;
\mathrm{Softmax}(I_{t,:})
\right)
$$

将 KL 展开：

$$
D_{\mathrm{KL}}
\left(
p_{t,:}\;\|\;\pi^I_{t,:}
\right)
=
\sum_{s<t}
p_{t,s}
\log
\frac{p_{t,s}}{\pi^I_{t,s}}
$$

该阶段的含义是：indexer 先学习 dense attention 认为哪些历史位置值得看。它还没有强迫主模型只读 top-k。

DeepSeek-V3.2 报告中，这个 warm-up 训练 1000 steps，每步 16 条 128K 序列，总计约 2.1B tokens。

### 4.2 Sparse training 阶段

第二阶段引入 top-k selection。选择集合写成：

$$
S_t
=
\{s:I_{t,s}\in \operatorname{TopK}(I_{t,:})\}
$$

此时 indexer 的 KL 目标只在选中集合上计算：

$$
\mathcal{L}_I
=
\sum_t
D_{\mathrm{KL}}
\left(
p_{t,S_t}
\;\|\;
\mathrm{Softmax}(I_{t,S_t})
\right)
$$

也就是：

$$
D_{\mathrm{KL}}
\left(
p_{t,S_t}
\;\|\;
\pi^I_{t,S_t}
\right)
=
\sum_{s\in S_t}
p_{t,s}
\log
\frac{p_{t,s}}{\pi^I_{t,s}}
$$

主模型的语言建模损失仍然是：

$$
\mathcal{L}_{\mathrm{LM}}
=
\mathbb{E}_x
\left[
\sum_t
-\log p_\theta(x_{t+1}\mid x_{\le t};S_t)
\right]
$$

报告中特别指出，indexer input 会从计算图里 detach；indexer 的训练信号来自 $\mathcal{L}_I$，主模型按语言建模损失优化。V3.2 sparse training 阶段每个 query 选择 2048 个 key-value tokens，训练 15000 steps，总计约 943.7B tokens。

### 4.3 DSA 的复杂度账本

DSA 的复杂度变化需要分成两层看。dense MLA 主 attention 的主要计算可以粗写成：

$$
\mathrm{Cost}_{\mathrm{dense}}
\approx
O(L^2 c n_h)
$$

其中 $c$ 是主 attention 的 KV/latent 维度，$n_h$ 是主 query heads 数。引入 DSA 后，主 attention 只在 top-k 上精算，但 indexer 仍要扫描历史：

$$
\mathrm{Cost}_{\mathrm{DSA}}
\approx
O(L^2 c_I H^I)
+
O(L k_{\mathrm{idx}} c n_h)
$$

关键条件是：

$$
c_IH^I \ll cn_h,\qquad k_{\mathrm{idx}}\ll L.
$$

因此，DSA 的工程收益来自把昂贵二次项替换成廉价二次筛选，再加一个小得多的主 attention 读出项。它没有让所有 $L^2$ 结构消失，但把 $L^2$ 里最贵的部分压到了 indexer 路径。

报告还提到 prefill 与 decode 路径会采用不同实现策略：短序列 prefill 可以用 masked MHA mode 模拟 DSA 以获得更高效率；真正的长上下文收益主要来自 long-context prefill 与 decode 中 sparse read 的端到端加速。

因此，DeepSeek-V3.2 中的 index 已经超出普通数组下标：它先由独立小网络生成检索分数，再转成每个 query 的 KV 读取集合。

## 5. DeepSeek-V4 的 Index：从 Token 选择变成 Compressed Block 选择

DeepSeek-V4 继续使用 DSA 的思想，但把 sparse selection 放到了压缩后的 KV blocks 上。这个变化很关键。

从统一视角看，V3.2 / GLM-5 的主干属于 latent write + token-level sparse read：

$$
M_t^{\mathrm{V3.2}}
=
\{c_s^{KV}:s\le t\},
\qquad
S_t=\operatorname{TopK}_{k_{\mathrm{idx}}}(I_{t,:})
$$

V4 则先把历史改写成 compressed block list，再决定 sparse 或 dense 地读取这些 block：

$$
M_t^{\mathrm{CSA}}
=
\{C_i^{\mathrm{Comp}}:i\le \lfloor t/m\rfloor\}
\cup
\mathcal{I}_{\mathrm{local}}(t)
$$

这使 V4 的 index 从 token-level latent KV 地址迁移到 block-level compressed KV 地址。

若 V3.2 的选择单位是：

$$
\text{raw token / MLA latent KV entry}
$$

那么 V4 的 CSA 选择单位是：

$$
\text{compressed KV block}
$$

### 5.1 CSA 先改变 KV 的表示形态

DeepSeek-V4 的 CSA 先将每 $m$ 个 token 的 KV cache 压缩成一个 entry。报告中 V4 的典型设置是：

$$
m=4
$$

先从 hidden states 得到两组 KV entries 和两组 compression weights：

$$
C^a=H W_{KV}^a,\qquad C^b=H W_{KV}^b
$$

$$
Z^a=H W_Z^a,\qquad Z^b=H W_Z^b
$$

第 $i$ 个 compressed entry 使用一个带 overlap 的窗口。先把两段 compression score 加上可学习的位置偏置，再沿 row 维度 softmax：

$$
\left[
S^a_{mi:m(i+1)-1};
S^b_{m(i-1):mi-1}
\right]
=
\mathrm{Softmax}_{\mathrm{row}}
\left(
\left[
Z^a_{mi:m(i+1)-1}+B^a;
Z^b_{m(i-1):mi-1}+B^b
\right]
\right)
$$

compressed KV entry 写成：

$$
C_i^{\mathrm{Comp}}
=
\sum_{j=mi}^{m(i+1)-1}
S^a_j\odot C^a_j
+
\sum_{j=m(i-1)}^{mi-1}
S^b_j\odot C^b_j
$$

这里 $\odot$ 是按维度相乘。该式说明 CSA 不同于平均池化。每个 compressed entry 是 learned gated pooling 的结果，并且 c4a 路径有 overlap。

### 5.2 CSA 的 indexer 在 compressed blocks 上打分

得到主 attention 用的 $C^{\mathrm{Comp}}$ 后，CSA 还会用类似压缩操作得到 indexer keys：

$$
K^{I\mathrm{Comp}}
\in
\mathbb{R}^{\frac{n}{m}\times c_I}
$$

对 query token $t$，先生成 query 的低秩 latent：

$$
c_t^Q
=
h_t W^{DQ}
$$

再生成多个 indexer query heads：

$$
[q_{t}^{I,1};q_{t}^{I,2};\ldots;q_t^{I,n_h^I}]
=
c_t^Q W^{IUQ}
$$

同时从 hidden state 产生各 indexer head 的权重：

$$
[w_t^{I,1};w_t^{I,2};\ldots;w_t^{I,n_h^I}]
=
h_t W^w
$$

对某个 preceding compressed block $s$，可见条件是：

$$
s<\left\lfloor\frac{t}{m}\right\rfloor
$$

index score 是：

$$
I_{t,s}
=
\sum_{h=1}^{n_h^I}
w_t^{I,h}
\cdot
\mathrm{ReLU}
\left(
q_t^{I,h}\cdot K_s^{I\mathrm{Comp}}
\right)
$$

再取 top-k compressed KV entries：

$$
S_t^{\mathrm{CSA}}
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\{I_{t,s}:s<\lfloor t/m\rfloor\}
$$

实际读到的远程 compressed KV 集合是：

$$
\{C_s^{\mathrm{Comp}}:s\in S_t^{\mathrm{CSA}}\}
$$

选出这些 compressed blocks 后，CSA 再对它们做 shared-KV MQA。query 侧仍从低秩 latent 上投影出多头 query：

$$
[q_{t,1};q_{t,2};\ldots;q_{t,n_h}]
=
c_t^Q W^{UQ}
$$

第 $i$ 个主 query head 的核心 attention 可以写成：

$$
o_{t,i}
=
\mathrm{CoreAttn}
\left(
q_{t,i},
\{C_s^{\mathrm{Comp}}:s\in S_t^{\mathrm{CSA}}\},
\{C_s^{\mathrm{Comp}}:s\in S_t^{\mathrm{CSA}}\}
\right)
$$

这里的 key 和 value 都来自同一组 compressed entries，说明 CSA 的主读出对象已经是被压缩且被 indexer 选中的块状态。

因此，V4 中 top-k 外的对象已经从原始 token 换成 compressed block。一个 block 没被选中，也不能推出其中每个 token 都无意义；它只表示该 compressed entry 在当前 query 的预算排序里没有进入 top-k。

### 5.3 V4 旁边还有 HCA 和 SWA

DeepSeek-V4 没有把全部长上下文读取都交给 CSA top-k。

HCA 使用更大的压缩率：

$$
m'=128
$$

HCA 也先压缩 KV：

$$
C=H W^{KV},\qquad Z=HW^Z
$$

然后每 $m'$ 个 token 压成一个 entry：

$$
S_{m'i:m'(i+1)-1}
=
\mathrm{Softmax}_{\mathrm{row}}
\left(
Z_{m'i:m'(i+1)-1}+B
\right)
$$

$$
C_i^{\mathrm{Comp}}
=
\sum_{j=m'i}^{m'(i+1)-1}
S_j\odot C_j
$$

但 HCA 不再使用 sparse selection。它在更短的 compressed sequence 上做 dense attention：

$$
\mathcal{I}_{\mathrm{remote}}^{\mathrm{HCA}}(t)
=
\{s:s<\lfloor t/m'\rfloor\}
$$

SWA 则保留最近窗口的原始 token：

$$
\mathcal{I}_{\mathrm{local}}(t)
=
\{s:\max(0,t-n_{\mathrm{win}})\le s<t\}
$$

V4 的实际读取结构可概括为：

$$
\mathcal{I}_{\mathrm{attn}}(t)
=
\mathcal{I}_{\mathrm{local}}(t)
\cup
\mathcal{I}_{\mathrm{remote}}(t)
$$

其中 CSA 层的 $\mathcal{I}_{\mathrm{remote}}(t)$ 来自 learned top-k，HCA 层的 $\mathcal{I}_{\mathrm{remote}}(t)$ 来自所有可见 compressed blocks。

报告给出的配置包括：V4-Flash 的 CSA top-k 是 512，V4-Pro 的 CSA top-k 是 1024；两者 CSA 的 compression rate 是 $m=4$，indexer query heads 是 64，indexer head dimension 是 128；HCA 的 compression rate 是 $m'=128$；SWA window 是 128。

### 5.4 V4 的 indexer 还是系统瓶颈之一

CSA 减少了 indexer 的搜索空间：原来每个 query 要扫 $L$ 个 token，现在扫约 $L/m$ 个 compressed blocks。

但 indexer 仍要为大量 query-candidate 对生成 score。DeepSeek-V4 报告中进一步对 CSA indexer 的 QK path 使用 FP4，并将 index scores 从 FP32 量化到 BF16。报告给出的结果是：top-k selector 获得约 2 倍加速，同时保持 99.7% 的 KV entry recall。

该 recall 验证的是低精度 selector 和原 selector 的一致性，不能直接推出 sparse attention 与 full attention 完全等价。

### 5.5 V4 的训练位置和公开超参

DeepSeek-V4 报告给出的结构细节很适合用来判断它和 V3.2 的家族边界。以 V4-Pro 为例：

| 组件 | 公开设置 | index 含义 |
| --- | --- | --- |
| CSA | $m=4$，indexer heads 为 64，index head dim 为 128，top-k 为 1024 | 在轻压缩 blocks 上做 learned retrieval |
| HCA | $m'=128$ | 把历史压短后全读 compressed blocks |
| SWA | window 为 128 | 保留局部原始 token 细节 |
| query path | query heads 为 128，head dim 为 512，query compression dim 为 1536 | 主读出使用低秩 query 投影 |
| output path | grouped output projection 组数为 16 | 降低投影与通信压力 |

层级安排也带有明显的混合结构：前段层使用 HCA，后续层交替使用 CSA 与 HCA。训练长度从 4K 延长到 16K、64K、1M，并在 64K 阶段引入 sparse attention；引入后先做短暂 indexer warm-up，再进入长阶段稀疏训练。

这说明 V4 的改动已经超出 top-k 数值调整。它先改变 memory 的写入形态，再在 compressed history 上决定读取策略。CSA 对轻压缩历史做 top-k，HCA 对重压缩历史做全读，SWA 用最近窗口补回局部细节。

## 6. GLM-5/5.1 的 Index：把 DeepSeek DSA 接入 GLM-MoE-DSA

GLM-5 技术报告明确写到，GLM-5 adopts DSA，以降低训练和推理成本，同时保持长上下文能力。这里的 DSA 指 DeepSeek Sparse Attention。

因此，GLM-5 里的 attention index 更接近：

> GLM 的 MoE/MLA 主干 + DeepSeek-style DSA indexer + GLM 自己的训练、RL 和推理稳定性处理。

### 6.1 GLM-5 的 MLA + DSA 路线

GLM-5 可以拆成两层理解：

1. 记忆接口层：沿用 MLA + DSA，也就是 latent write + token-level sparse read。
2. 工程适配层：通过 Muon Split 与 MLA-256 调整 MLA，使它更适合特定训练优化器和 decode 计算形态。

Muon Split 处理的是 MLA 在 Muon 优化器下的 head 更新问题。GLM-5 报告指出，原始 MLA 的 576 维 latent KV cache 在该训练设置下难以达到 GQA-8 的效果，因此把多头 query/key/value 的上投影矩阵按 head 拆开后分别正交化，让各 head 的更新尺度更灵活。

MLA-256 处理的是 decode 侧的计算问题。GLM-5 将 head dimension 从 192 调到 256，同时减少 attention heads 数量，使训练总算力和参数量大体保持相近，并降低 decode 阶段的 dot product 压力。

从 index 角度看，这两项修改没有改变 DSA 的核心接口。历史仍以 MLA latent KV 写入；当前 query 仍通过 DSA indexer 选出 top-k 历史位置；主 attention 再在该子集上读取。

### 6.2 GLM-5/5.1 配置里的 index 参数

GLM-5 与 GLM-5.1 的 Hugging Face 配置中，与 attention index 直接相关的字段高度一致：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `model_type` | `glm_moe_dsa` | GLM MoE + DSA 架构 |
| `architectures` | `GlmMoeDsaForCausalLM` | Transformers 架构类 |
| `max_position_embeddings` | 202752 | 最大位置长度，约 200K |
| `index_topk` | 2048 | 每个 query 由 indexer 选出的 top-k token 数 |
| `index_head_dim` | 128 | indexer projection 的 head dimension |
| `index_n_heads` | 32 | indexer projection 的 head 数 |
| `kv_lora_rank` | 512 | MLA KV 低秩维度 |
| `q_lora_rank` | 2048 | query 低秩维度 |
| `num_attention_heads` | 64 | 主 attention heads |
| `num_key_value_heads` | 64 | key/value heads |
| `qk_head_dim` | 256 | 主 attention QK head dimension |
| `v_head_dim` | 256 | value head dimension |

需要区分两种 top-k：

| 字段 | 所属机制 | 选择对象 |
| --- | --- | --- |
| `index_topk=2048` | attention DSA indexer | 历史 token/KV positions |
| `num_experts_per_tok=8` | MoE router | routed experts |

这两者都叫 top-k，但属于不同 index。前者决定 attention 读哪些 KV row；后者决定当前 token 激活哪些专家。

GLM-5.1 的公开配置继续保留 `GlmMoeDsaForCausalLM`、`glm_moe_dsa`、`index_topk=2048`、`index_head_dim=128`、`index_n_heads=32`、`kv_lora_rank=512` 和 `q_lora_rank=2048`。这说明 GLM-5 报告里的 MLA + DSA 主干，在 5.1 公开权重中仍是结构化参数的一部分。

### 6.3 GLM-5 报告中的 DSA 训练路径

GLM-5 的 DSA 引入点在 base model 完成 mid-training 之后。

报告中的 DSA 适配路径是：

1. warm-up 阶段：训练 1000 steps，每步 14 条 202,752-token 序列，最大学习率 $5\times 10^{-3}$。
2. sparse adaptation 阶段：沿用 mid-training 数据和超参，训练 20B tokens。

GLM-5 报告强调，20B token 的 DSA 适配预算远小于 DeepSeek-V3.2 的 943.7B token，但足以让 DSA 模型接近原 MLA 模型的表现。

形式化地说，GLM 的 DSA 适配仍然可以写成两个目标。

indexer 目标：

$$
\mathcal{L}_{I}
=
\sum_t
D_{\mathrm{KL}}
\left(
p_{t,S_t}
\;\|\;
\mathrm{Softmax}(I_{t,S_t})
\right)
$$

主模型目标：

$$
\mathcal{L}_{\mathrm{LM}}
=
\mathbb{E}_{x}
\left[
\sum_t
-\log p_\theta(x_{t+1}\mid x_{\le t};S_t)
\right]
$$

最终优化目标包含整条 sparse read path：indexer、MLA attention、MoE 和后续层一起适应 sparse read pattern。

### 6.4 Transformers 实现里的 GLM Indexer

Hugging Face Transformers 的 `GlmMoeDsaIndexer` 实现给出了 GLM-5 indexer 的工程形态。

它有自己的 lightweight projections：

```python
self.wq_b = nn.Linear(q_lora_rank, index_n_heads * index_head_dim)
self.wk = nn.Linear(hidden_size, index_head_dim)
self.k_norm = nn.LayerNorm(index_head_dim)
self.weights_proj = nn.Linear(hidden_size, index_n_heads)
```

它也维护自己的 key cache：

```python
self.register_buffer("_cached_keys", None, persistent=False)
```

这说明 GLM-5 的 indexer key cache 和主 MLA 的 KV cache 是分开的。主 attention 需要保存能产生输出的 KV；indexer 需要保存便宜打分用的 keys。

按照代码路径，query projection 可以写成：

$$
q_t^I
=
W_q^I\,q_t^{\mathrm{resid}}
$$

拆成多个 indexer heads：

$$
q_t^I
\rightarrow
\{q_{t,1}^I,\ldots,q_{t,H^I}^I\}
$$

key projection 写成：

$$
k_s^I
=
\mathrm{Norm}
\left(
W_k^I h_s
\right)
$$

head 权重来自 hidden state：

$$
w_{t,h}^I
=
\left(W_w^I h_t\right)_h\cdot (H^I)^{-1/2}
$$

代码中还对 indexer query/key 的 RoPE 部分做位置编码。忽略 RoPE 展开和 dtype 细节，score 路径是：

$$
\mathrm{score}_{t,h,s}
=
\left(q_{t,h}^{I}\right)^\top k_s^I
\cdot
(d_I)^{-1/2}
$$

然后：

$$
\widetilde{\mathrm{score}}_{t,h,s}
=
\mathrm{ReLU}
\left(
\mathrm{score}_{t,h,s}
\right)
$$

跨 indexer heads 加权求和：

$$
I_{t,s}
=
\sum_{h=1}^{H^I}
w_{t,h}^I
\widetilde{\mathrm{score}}_{t,h,s}
$$

最后取 top-k：

$$
S_t
=
\operatorname{TopK}_{2048}
\{I_{t,s}:s\in\mathcal{P}_t\}
$$

Transformers 实现随后构造一个 index mask。先把所有位置设成 $-\infty$：

$$
M_{t,s}^{\mathrm{index}}=-\infty
$$

再把 top-k 位置 scatter 成 0：

$$
M_{t,s}^{\mathrm{index}}=0,\qquad s\in S_t
$$

和 causal mask 相加后，主 attention 只会在 $S_t$ 上得到非 $-\infty$ 的 score：

$$
\tilde{e}_{t,s}
=
q_t^\top k_s
+
M_{t,s}^{\mathrm{index}}
+
M_{t,s}^{\mathrm{causal}}
$$

于是：

$$
\tilde{\alpha}_{t,s}
=
\frac{\exp(\tilde{e}_{t,s})}
{\sum_{r}\exp(\tilde{e}_{t,r})}
$$

对于不在 $S_t$ 的位置，$M_{t,s}^{\mathrm{index}}=-\infty$，因此：

$$
\tilde{\alpha}_{t,s}=0
$$

这就是 GLM-5 中 index 从 score 变成 sparse attention mask 的路径。

### 6.5 GLM 中的 deterministic top-k 问题

GLM-5 报告在 RL 部分特别提到 DSA indexer 的训练稳定性。top-k 结果对 RL 很关键，类似 MoE 里的 routing path。

一种直接做法是把每个 token 的 top-k indices 存下来，在训练时 replay。但 GLM-5 的 $k=2048$，远大于 MoE 的专家 top-k，存储和通信成本都会很高。

报告给出的处理方式是使用 deterministic top-k operator，减少训练和推理之间的 token selection mismatch。报告中说，naive `torch.topk` 稍慢但确定性更强；非确定性 CUDA/TileLang top-k 在 RL 中会导致性能快速退化。GLM-5 在 RL 阶段默认使用 `torch.topk`，并默认冻结 indexer 参数，以加速训练并避免 indexer 不稳定学习。

这说明 GLM 的 index 不只是推理加速模块。它也进入了 RL 稳定性边界：同一个 prompt 如果因为非确定性 top-k 读到不同 KV row，后续 token 分布和优势估计都可能改变。

## 7. DeepSeek 与 GLM 的 Index 对比

可以把三条路径放在一张表里：

| 系统 | index 选择单位 | index score 来源 | top-k 预算 | 主 attention 读取对象 |
| --- | --- | --- | --- | --- |
| Dense Transformer | 无 learned indexer | $q_t^\top k_s$ | 不做 top-k | 所有可见 KV |
| DeepSeek-V3.2 DSA | token / MLA latent KV entry | lightning indexer | 2048 | top-k latent KV entries |
| DeepSeek-V4 CSA | compressed KV block | compressed-block indexer | Flash 512 / Pro 1024 | top-k compressed KV entries + SWA |
| DeepSeek-V4 HCA | deterministic compressed positions | 无 learned top-k indexer | 不做 top-k | 所有可见重压缩 entries + SWA |
| GLM-5/5.1 DSA | token / KV position | DSA indexer | 2048 | top-k KV positions |

这里最容易混淆的是 DeepSeek-V4 和 GLM-5。

DeepSeek-V4 的 CSA indexer 选择 compressed blocks。压缩率 $m=4$ 意味着 indexer 的候选序列长度约为原始长度的四分之一。它先改变 memory representation，再做预算检索。

GLM-5/5.1 的公开配置和 Transformers 实现展示的是 GLM-MoE-DSA：indexer 直接产出 token indices，`index_topk=2048`，再通过 mask 或 flash MLA 的 `indices=topk_indices` 路径进入主 attention。它采用 DeepSeek-style DSA，机制上区别于 DeepSeek-V4 的 CSA/HCA hybrid compression。

因此，“DeepSeek 和 GLM 都有 index”这句话需要细分：

1. DeepSeek-V3.2 和 GLM-5/5.1：index 是 DSA 的 learned token selector。
2. DeepSeek-V4 CSA：index 是 compressed block selector。
3. DeepSeek-V4 HCA：没有 learned top-k selector，使用规则确定的 compressed visibility。
4. 普通 attention：index 只是位置地址。

## 8. Index 质量如何评估

### 1. Captured Attention Mass

在短 context 上运行 dense attention，得到 full attention weights：

$$
\alpha_{t,s}^{\mathrm{dense}}
$$

然后看 indexer 选出的集合 $S_t$ 捕获了多少 dense mass：

$$
\mathrm{CapturedMass@k}
=
\sum_{s\in S_t}
\alpha_{t,s}^{\mathrm{dense}}
$$

未捕获 mass 是：

$$
\mathrm{MissedMass@k}
=
1-\mathrm{CapturedMass@k}
$$

CapturedMass@k 高，说明 indexer 的选择接近 dense attention 的主要质量分布。但它只能说明某层 attention mass 的近似，不等于最终输出完全一致。

### 2. Oracle top-k vs learned top-k

先定义 oracle selection：

$$
S_t^{\mathrm{oracle}}
=
\operatorname{TopK}_{k}
\{\alpha_{t,s}^{\mathrm{dense}}:s<t\}
$$

模型 indexer selection 是：

$$
S_t^{\mathrm{model}}
=
\operatorname{TopK}_{k}
\{I_{t,s}:s<t\}
$$

Recall@k 可以写成：

$$
\mathrm{Recall@k}
=
\frac{
|S_t^{\mathrm{oracle}}\cap S_t^{\mathrm{model}}|
}{
|S_t^{\mathrm{oracle}}|
}
$$

该指标检查 learned indexer 是否选中了 dense attention 认为最重要的位置。它仍不能证明 sparse path 与 dense path 在 next-token loss 上等价。

### 3. Downstream Loss Delta

最终更接近训练目标的指标是负对数似然差：

$$
\Delta\mathrm{NLL}
=
\ell_t^{\mathrm{sparse}}
-
\ell_t^{\mathrm{dense}}
$$

其中：

$$
\ell_t^{\mathrm{sparse}}
=
-\log p_{\mathrm{sparse}}(x_{t+1}\mid x_{\le t};S_t)
$$

$$
\ell_t^{\mathrm{dense}}
=
-\log p_{\mathrm{dense}}(x_{t+1}\mid x_{\le t})
$$

如果 $\Delta\mathrm{NLL}$ 很小，说明 indexer 的 sparse read pattern 对语言建模目标影响较小。

### 4. Cross-Layer Index Similarity

IndexCache 关注的是另一个问题：DSA indexer 本身仍然有 $O(L^2)$ 复杂度，而且每层都单独运行。若相邻层选出的 top-k 很相似，可以复用部分层的 indices。

第 $\ell$ 层的选择集合写成：

$$
S_t^{(\ell)}
$$

相邻层 overlap 可以写成：

$$
\mathrm{Overlap}^{(\ell,\ell+1)}
=
\frac{
|S_t^{(\ell)}\cap S_t^{(\ell+1)}|
}{
k_{\mathrm{idx}}
}
$$

如果多层 overlap 高，就可以让部分层不运行自己的 indexer，而复用邻近 full-indexer 层的 top-k：

$$
S_t^{(\ell)}
\leftarrow
S_t^{(\ell^\star)}
$$

Transformers 的 `GlmMoeDsaConfig` 也已经有 `indexer_types` 概念，可以把层标成 `"full"` 或 `"shared"`。这类复用优化说明：index 不只是一层内的选择问题，也可以成为跨层 cache。

## 9. 这些设计押了哪些经验判断

DeepSeek 和 GLM 的 DSA index 设计背后有几条经验判断：

1. 长上下文里的远程依赖通常是稀疏的。当前 query 不需要均匀读取所有历史 token。
2. 内容相关的选择优于固定窗口。固定窗口只能表达“近处更重要”，learned indexer 能表达“远处某段证据更重要”。
3. indexer 可以比主 attention 便宜。用较少 heads、较小 head dimension、低精度 QK path 和专门 cache，可以先筛选再精算。
4. sparse pattern 需要训练适配。只在推理时临时加 top-k mask，通常不等价于训练过的 DSA。
5. top-k 本身是系统状态。训练和推理中的 top-k 不一致，会影响 RL 稳定性和结果复现。
6. index 的含义是局部的。它只对当前层、当前 query 和当前预算成立，不能直接外推为 token 的全局重要性。

## 10. 总结

注意力机制中的 index 可以总结为：

> 在 dense attention 中，index 是历史 KV 的地址；在 DSA 中，indexer 把地址变成可学习的预算读取集合；在 DeepSeek-V4 中，index 进一步从 token 地址迁移到 compressed block 地址；在 GLM-5/5.1 中，DSA index 成为 GLM-MoE-DSA 的长上下文读取接口，并影响训练、推理和 RL 稳定性。

普通 attention 的读取集合是：

$$
\mathcal{I}_{\mathrm{attn}}(t)
=
\mathcal{P}_t
$$

DSA 先计算 index score：

$$
I_{t,s}
=
\sum_h
w_{t,h}^I
\mathrm{ReLU}
\left(
q_{t,h}^I\cdot k_s^I
\right)
$$

再做预算内检索：

$$
S_t
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\{I_{t,s}\}_s
$$

最后只在选中 KV 上做主 attention：

$$
\hat{o}_t
=
\mathrm{Attn}
\left(
q_t,\{k_s,v_s:s\in S_t\}
\right)
$$

DeepSeek-V4 的 CSA 把候选从 token 换成 compressed block：

$$
S_t^{\mathrm{CSA}}
=
\operatorname{TopK}_{k_{\mathrm{idx}}}
\{I_{t,s}:s<\lfloor t/m\rfloor\}
$$

GLM-5 则在 GLM-MoE-DSA 中使用：

$$
k_{\mathrm{idx}}=2048,\qquad
d_I=128,\qquad
H^I=32
$$

合在一起就是：

$$
\boxed{
\mathrm{attention\ index}
=
\mathrm{visible\ address}
+
\mathrm{learned\ relevance\ score}
+
\mathrm{budgeted\ KV\ gather}
}
$$

index 的作用是在资源预算下决定当前 query 这一次应该把计算花在哪些历史记忆上；它不承担给 token 下最终判决的任务。
