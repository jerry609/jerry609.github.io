---
title: 'DeepSeek-V4 的 KV 压缩：从删 token 误解到预算检索'
description: '从 CSA、HCA 和 SWA 的分工出发，把 DeepSeek-V4 的百万上下文注意力理解为带预算的检索、压缩与端到端损失最小化问题。'
publishDate: '2026-04-30'
tags: ['ai', 'deepseek', 'transformer', 'attention', 'kv-cache']
language: 'zh-CN'
draft: false
---

DeepSeek-V4 的百万上下文，最容易被读成下面这句话：

> 模型只看 top-k，所以其他 token 对生成没意义。

这句话把事情说歪了。

我更愿意把它看成一个工程取舍：长上下文 attention 到头来会变成有预算的检索和汇聚。每个 query 都在问一件很朴素的事：这段旧记忆值不值得现在打开？

DeepSeek-V4 的混合注意力设计，可以压成一句顺口的话：

> 近处细看，远处摘要，需要时再检索。

top-k 外面的 token 仍然可能有用。它只是在**当前层、当前 query、当前 head/分支**里，没有被单独展开读。它可能已经进了 block 摘要，可能还躺在 HCA 的全局粗记忆里，也可能对这一次预测的边际贡献确实很小。

本文主要参考 [DeepSeek-V4 技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf) 和 Hugging Face 的 [DeepSeek-V4 解读](https://huggingface.co/blog/deepseekv4)。报告里给出的配置很有意思：V4-Pro 支持 1M token 上下文，CSA 压缩率 $m=4$、attention top-k 为 1024，HCA 压缩率 $m'=128$，SWA 窗口为 128；V4-Flash 的 CSA top-k 为 512。

## 1. 先看清楚它到底压了什么

完整 attention 可以写成：

$$
o_t=\sum_{i<t}\alpha_{t,i}v_i,\qquad
\alpha_{t,i}=\mathrm{softmax}(q_t k_i)
$$

直觉上，只要少看一些 token，就会丢信息。这个直觉没错，但它太粗。

DeepSeek-V4 的 CSA（Compressed Sparse Attention）先把一小段历史压成一个可以检索的 memory entry：

$$
z_b=\Phi(h_{bm},\ldots,h_{bm+m-1})
$$

当前 query 先去这些 block memory 里找相关项：

$$
S_t=\mathrm{TopK}(g_\psi(q_t,z_b))
$$

然后只对选中的 compressed KV entries 做 attention。

所以，如果把它讲成：

> 这 100 万 token 里只保留 1024 个 token。

读者很容易误会。更贴近实际机制的讲法是：

> 历史先被压成很多局部摘要；当前 query 从这些摘要里挑一批来读；最近 token 继续交给 SWA 原样处理；更远处的背景由 HCA 用粗粒度记忆覆盖。

CSA 的访问单位从原始 token 变成了压缩记忆块。问题也跟着变了：当前 query 要不要访问这个块？

## 2. top-k 为什么经常够用

对某个 query 来说，完整 attention 的输出是很多 value 的加权和。要看的其实是 attention mass 怎么分布。

设选中的集合是 $S$，没选中的残余 attention mass 是：

$$
R_t(S)=\sum_{i\notin S}\alpha_{t,i}
$$

如果 $R_t(S)$ 很小，被排除那部分对当前输出的影响就小。假设 value 范数有界 $\|v_i\|\le V$，完整输出可以拆成：

$$
o_t=(1-R)o_S + R o_{\bar S}
$$

重新归一化后的近似误差有一个很直观的上界：

$$
\|o_t-o_S\|\le 2VR
$$

这里的判断标准很朴素：这个 token 或 block 在当前输出里分到了多少质量？

DeepSeek-V4 选的是 compressed block，粒度已经从 token 升到了 block。因此误差大概来自两头：

$$
\|\mathrm{FullAttn}-\mathrm{CSA}\|
\lesssim
\underbrace{\mathrm{selection\ error}}_{\text{top-k 没选到重要块}}
+
\underbrace{\mathrm{compression\ error}}_{\text{块摘要不够表达原 token}}
$$

于是问题变成两个小问题。

第一个问题：重要信息会不会集中在少数 block 里？很多语言任务里会。下一 token 往往强依赖最近上下文、当前指令、几个实体、几段证据。它通常不会均匀依赖整整 100 万 token。

第二个问题：压缩后的 block 能不能保留未来会被问到的特征？DeepSeek-V4 的压缩采用 learned weighted summary。报告里的 CSA 会生成 trainable projection、compression weights 和 positional bias，再通过 softmax 权重合成 compressed entry。这比平均池化细得多，也比“把一段文本缩成一句话”更像神经网络内部的记忆整理。

## 3. top-k 外面的 token 去了哪里

一个 token 在这套架构里大概会有几种去处。

它可能进入了某个 compressed KV entry。原 token 虽然没有以独立 KV 的形式留下，但信息仍可能进了 block 摘要。

它所在的 compressed block 可能被 top-k 选中。模型不会逐 token 展开这段历史，但会读到这个 block 的压缩表示。

它也可能没进 CSA 的候选集合，却被 HCA 看到了。HCA 用更大的压缩率 $m'=128$ 把远程上下文变成更短的全局记忆流，然后在这条重压缩序列上做 dense attention。

还有一种情况更简单：当前 query 确实没有用到它。这个判断很局部。下一层、下一个 query、另一个 head，完全可能选到另一个 block。

所以，“无意义”这个词太重了。可以换成一个局部定义：

> token $i$ 对 query $t$ 在某层是 $\varepsilon$-irrelevant，如果删除、合并或不展开它之后，最终输出分布变化小于 $\varepsilon$。

用 KL divergence 可以写成：

$$
\Delta_i =
D_{\mathrm{KL}}\left(
p_{\mathrm{full}}(y_t\mid x_{\le t})
\;\|\;
p_{\mathrm{compressed/no}\ i}(y_t\mid x_{\le t})
\right)
$$

如果 $\Delta_i$ 很小，它对这一次预测的贡献就低。这个结论不要外推成永久判决。

## 4. top-k 旁边还站着 SWA 和 HCA

只做远程 top-k 会很危险。局部语法、短程引用、当前句子结构、代码缩进、括号匹配，这些都吃最近 token 的细节。

所以 DeepSeek-V4 还保留了 Sliding Window Attention。报告给出的理由也直接：CSA/HCA 的 query 只能 attend 到 preceding compressed blocks，不能访问自己所在压缩块内部的全部细节；语言建模里 recent tokens 往往更相关。因此 V4 额外保留最近 $n_{\mathrm{win}}$ 个未压缩 KV entries 来处理局部依赖。

三条分支的分工很清楚：

| 分支 | 作用 | 信息形态 |
| --- | --- | --- |
| SWA | 最近上下文细节 | 未压缩 token |
| CSA | 远程重点证据 | 中等压缩 + top-k 检索 |
| HCA | 全局背景/粗摘要 | 重压缩 + dense attention |

这套方案没有把全部压力压到 top-k 上。它更像一套多分辨率记忆：近处用高清，远处用缩略图，需要时再点开最相关的缩略图。

## 5. 为什么训练后能跑起来

如果拿一个 full-attention 模型，推理时突然把 KV 压缩再 top-k，效果大概率会崩。原模型没学过怎么把信息写进这种记忆格式，也没学过怎么从这种格式里读。

DeepSeek-V4 的压缩器、indexer、attention、后面的 MLP/MoE 是一起训练的。

报告里的训练路径别跳过：模型从较短序列开始训练，逐步扩到 16K、64K、1M；稀疏注意力没有从第一天就启用，前面先做 dense attention warmup；到 64K 阶段再引入 sparse attention，并先 warm up CSA 的 lightning indexer，随后在大部分训练中使用 sparse attention。

这会逼模型学会几件事：

1. 早期层把局部信息写进更容易压缩的 hidden state。
2. 压缩器保留未来 query 可能需要的特征。
3. indexer 根据 query 找相关 block。
4. 后续层适应这种不完整但高效的记忆。

所以这里没有魔法。模型从训练时就被放进这种读取方式里，内部表示也会跟着改。

## 6. 把它写成优化问题

可以把这套机制写成一个带 KV/FLOPs 预算的 attention 近似问题。

原始语言建模目标是：

$$
\min_\theta \mathbb{E}_{x,y}
\left[
-\log p_\theta(y_t\mid x_{\le t})
\right]
$$

加入 KV 预算后，问题变成：

$$
\min_{\theta,\phi,\psi}
\mathbb{E}_{x,y}
\left[
-\log p_\theta(y_t\mid x_{\le t};\Phi_\phi,\mathrm{TopK}_\psi)
\right]
$$

约束是：

$$
\mathrm{KVMemory}\le M,\qquad \mathrm{FLOPs}\le C
$$

其中：

$$
z_b=\Phi_\phi(H_b)
$$

是 block 压缩器；

$$
S_t=\mathrm{TopK}_k(g_\psi(q_t,z_b))
$$

是检索器；

$$
\hat{o}_t=\mathrm{Attn}(q_t,\{z_b:b\in S_t\})
$$

是预算内的近似 attention。

这件事可以从三层看。

### A. Rate-distortion / 信息瓶颈

每个 block 原来有 $m$ 个 token 的 KV，现在只能存一个 vector。目标从保留全部信息，转到固定 memory rate 下的预测损失最小化：

$$
\min_\Phi \mathbb{E}[\mathrm{distortion}]
\quad
\mathrm{s.t.}\quad
\mathrm{memory\ budget}
$$

这里的 distortion 可以是 hidden-state 误差、attention-output 误差，也可以直接是 next-token loss。

### B. Learned retrieval / 学出来的检索器

top-k 选择可以看成检索问题：给定 query $q_t$，从所有 block memory $z_b$ 里找相关 block。

理想相关性可以用 dense attention 下的 block mass 表示：

$$
r_{t,b}=\sum_{i\in b}\alpha_{t,i}
$$

oracle top-k 会选择 $r_{t,b}$ 最大的 block。实际 indexer 要学一个更便宜的打分函数：

$$
g_\psi(q_t,z_b)\approx r_{t,b}
$$

### C. End-to-end loss minimization

最终目标还是生成质量。某个 block 在 dense attention 里有质量，不代表它一定要被选；只要拿掉它之后最终 token 分布几乎不变，模型就可以把预算留给别处。

更贴近训练目标的标准是：

$$
D_{\mathrm{KL}}(p_{\mathrm{full}}\|p_{\mathrm{sparse\text{-}compressed}})
$$

或者直接看：

$$
\Delta \mathrm{NLL}
=
-\log p_{\mathrm{sparse}}(y_t)
+
\log p_{\mathrm{full}}(y_t)
$$

## 7. 怎么看它有没有选对

如果要分析 CSA/HCA 的近似质量，可以看几类信号。

### 1. Captured Attention Mass

在较短 context 上跑 full attention，得到 dense attention mass，再把 token-level mass 聚合到 block：

$$
r_{t,b}=\sum_{i\in b}\alpha_{t,i}
$$

然后看模型 indexer 选出来的 block 捕获了多少 mass：

$$
\mathrm{CapturedMass@k}
=
\sum_{b\in S_t}r_{t,b}
$$

CapturedMass@k 越高，top-k 在这个分布下越靠谱。

### 2. Oracle top-k vs learned top-k

比较 oracle selection：

$$
S_t^{\mathrm{oracle}}=\mathrm{TopK}(r_{t,b})
$$

和 model selection：

$$
S_t^{\mathrm{model}}=\mathrm{TopK}(g_\psi(q_t,z_b))
$$

可以看 Recall@k：

$$
\frac{|S_t^{\mathrm{oracle}}\cap S_t^{\mathrm{model}}|}{k}
$$

报告中提到，CSA indexer 的 QK path 使用 FP4、index scores 从 FP32 量化到 BF16 后，top-k selector 获得 2x 加速，同时保持 99.7% 的 KV entry recall。这个 recall 验证的是“低精度加速后选出来的 KV entry 是否接近原 selector”，还不能直接推出 sparse attention 和 full attention 完全等价。

### 3. Compression distortion

对于某个 block，可以比较原始 token attention 与压缩 entry attention 的输出差异：

$$
D_b(q)=
\left\|
\mathrm{Attn}_{\mathrm{raw}}(q,b)
-
\mathrm{Attn}_{\mathrm{compressed}}(q,b)
\right\|
$$

差异越小，说明 compressed entry 对当前 query 的表达越够用。

### 4. Ablation 曲线

改变 $m,k,m',n_{\mathrm{win}}$，看 perplexity、LongBench、needle-in-haystack、多证据问答、代码任务怎么变。通常会得到一条 Pareto curve：

$$
\mathrm{quality}
\leftrightarrow
\mathrm{KV\ memory/FLOPs}
$$

报告里，LongBench-V2 上 DeepSeek-V3.2-Base 为 40.2，V4-Flash-Base 为 44.7，V4-Pro-Base 为 51.5。这个结果说明 V4 系列长上下文评测更强，但别把提升全算到 CSA/HCA 头上。数据、规模、训练策略、优化器也一起变了。

### 5. Adversarial / worst-case 测试

最容易暴露稀疏检索问题的，是那些必须均匀读取全文的任务：

1. 统计全文某个词出现次数。
2. 比较 1000 个分散证据。
3. 每段都有一个小事实，最终答案依赖全部事实。
4. needle 很短，且和 query 的语义相关性很弱。
5. 需要逐 token 级别精确复原。

这类任务会挑战“少数 top-k block 足够”的前提。HCA 可以保留一些全局 aggregate；任务一旦要求精确保留所有细节，压缩就会付出代价。

## 8. DeepSeek-V4 押了哪些经验判断

我会把这套设计背后的判断拆成几条：

1. 远程依赖通常比较稀疏。百万 token 里，对当前生成真正有用的远程片段往往只有一小部分。
2. 局部依赖很重要。最近 token 需要原样保留，这就是 SWA 的位置。
3. 远处信息有相当一部分可以摘要化。模型不一定需要每个 token 的完整 KV，只需要面向未来 query 的 memory representation。
4. 训练能让模型适应这种记忆格式。V4 在长上下文训练中逐步引入 sparse attention，并 warm up indexer，记忆格式从训练阶段就进入模型能力边界。
5. 真实任务分布通常避开最坏情况。用户如果构造一个必须均匀读取全上下文的算法题，top-k sparse attention 会更吃力。

## 9. 压成一句话

DeepSeek-V4 的 KV 压缩可以这样理解：

> 在给定生成位置上，大多数历史 token 不需要以原始 KV 形式逐个读取；它们要么可被局部摘要表示，要么当前 query 用不上，要么由全局压缩分支覆盖。真正要优化的是在 KV/FLOPs 预算下，让 next-token loss 尽量接近 full attention。

我会把它压成这个式子：

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

top-k 判断的是：当前 query 值不值得花计算预算，把这个 memory block 打开读。
