---
title: 'DeepSeek-V4 的 KV 压缩：从删 token 误解到预算检索'
description: '从 CSA、HCA 和 SWA 的分工出发，把 DeepSeek-V4 的百万上下文注意力理解为带预算的检索、压缩与端到端损失最小化问题。'
publishDate: '2026-04-30'
tags: ['ai', 'deepseek', 'transformer', 'attention', 'kv-cache']
language: 'zh-CN'
draft: false
---

DeepSeek-V4 的百万上下文能力，最容易被误解成一句话：

> 模型只看 top-k，所以其他 token 对生成没意义。

这个说法太粗了。更准确的理解是：

> LLM 的长上下文注意力，本质上是一个带预算的检索/汇聚问题。DeepSeek-V4 关注当前 query 是否值得为某段记忆花费展开读取的计算预算。

如果用一句人话概括 DeepSeek-V4 的混合注意力设计，它像是在把完整历史上下文改造成一个分层记忆系统：

> 近处细看，远处摘要，关键远处再检索。

top-k 之外的 token 仍可能有意义；更精确地说，它对**当前层、当前 query、当前 head/分支**来说，没有被单独展开读取。它们可能已经被压进 block 摘要里，可能仍在 HCA 的全局压缩记忆里，也可能只是在这个 query 上边际贡献很小。

本文主要参考 [DeepSeek-V4 技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf) 和 Hugging Face 的 [DeepSeek-V4 解读](https://huggingface.co/blog/deepseekv4)。报告中给出的关键配置包括：V4-Pro 支持 1M token 上下文，CSA 压缩率 $m=4$、attention top-k 为 1024，HCA 压缩率 $m'=128$，SWA 窗口为 128；V4-Flash 的 CSA top-k 为 512。

## 1. 先校正直觉：这里讨论的是压缩记忆

完整 attention 可以写成：

$$
o_t=\sum_{i<t}\alpha_{t,i}v_i,\qquad
\alpha_{t,i}=\mathrm{softmax}(q_t k_i)
$$

朴素直觉会觉得：如果少看某些 token，就一定丢信息。

但 DeepSeek-V4 的 CSA，即 Compressed Sparse Attention，第一步是把一小段历史压成一个可检索的 memory entry：

$$
z_b=\Phi(h_{bm},\ldots,h_{bm+m-1})
$$

然后当前 query 先在压缩后的 block memory 中检索，再访问少量相关 entry：

$$
S_t=\mathrm{TopK}(g_\psi(q_t,z_b))
$$

最后只对这些被选中的 compressed KV entries 做 attention。

因此，用下面这句话描述会误导读者：

> 这 100 万 token 里只保留 1024 个 token。

更贴近机制的描述是：

> 把历史压成许多局部摘要，再从中选出当前 query 最值得展开读取的摘要；同时最近 token 仍由 SWA 原样保留，远处背景还由 HCA 以更粗粒度覆盖。

这一步非常关键。CSA 的访问单位从“原始 token 是否存在”转向“某个压缩记忆块是否值得被当前 query 访问”。

## 2. 为什么 top-k 可以工作：attention 常常是稀疏贡献的

对某个 query 来说，完整 attention 的输出是很多 value 的加权和。真正重要的变量从上下文长度转向 attention mass 的分布。

设选中的集合是 $S$，没被选中的残余 attention mass 是：

$$
R_t(S)=\sum_{i\notin S}\alpha_{t,i}
$$

如果 $R_t(S)$ 很小，被排除部分对当前输出的贡献就小。假设 value 范数有界 $\|v_i\|\le V$，完整输出可以拆成：

$$
o_t=(1-R)o_S + R o_{\bar S}
$$

重新归一化后的近似误差有一个直观上界：

$$
\|o_t-o_S\|\le 2VR
$$

这给了我们一个更干净的判断标准：

> 判断标准可以改成：该 token 在当前 attention 输出里的残余贡献 mass 有多大。

当然，DeepSeek-V4 选中 compressed block，选择单位已经从原始 token 升到 block 级别。因此实际误差还要加上压缩本身的失真：

$$
\|\mathrm{FullAttn}-\mathrm{CSA}\|
\lesssim
\underbrace{\mathrm{selection\ error}}_{\text{top-k 没选到重要块}}
+
\underbrace{\mathrm{compression\ error}}_{\text{块摘要不够表达原 token}}
$$

所以 top-k 能否工作，取决于两个诊断问题：

第一，重要信息是否集中在少数 block 里。很多语言任务确实如此。下一 token 通常强依赖最近上下文、当前指令、若干实体、若干证据段，依赖不会均匀摊到全部 100 万 token 上。

第二，被压缩的 block 是否保留了“将来可能被问到”的特征。DeepSeek-V4 的压缩采用 learned weighted summary。报告中的 CSA 会生成 trainable projection、compression weights 和 positional bias，再通过 softmax 权重合成 compressed entry。它接近 learned memory summary，和把一段文本粗暴缩成一句话相差很远。

## 3. “被去掉的 token”只是没有被当前 query 展开读取

一个 token 在这种架构里大概有四种命运。

第一，它被压进了某个 compressed KV entry。即使原 token 不再以独立 KV 的形式出现，它的信息仍可能进入 block 摘要。

第二，它所在的 compressed block 被 top-k 选中了。模型虽然不会逐 token 看它，但会读到该 block 的压缩表示。

第三，它没有被 CSA 选中，但可能被 HCA 看到了。HCA 用更大的压缩率 $m'=128$ 把远程上下文变成更短的全局记忆流，然后在这条重压缩序列上做 dense attention。

第四，它在当前 query 上确实没有被使用。这也不等价于“永远无意义”。下一层、下一个 query、另一个 head，可能会选择不同的 block。

因此，“无意义”最好不要被理解成绝对语义判断。更精确的说法是：

> token $i$ 对 query $t$ 在某层是 $\varepsilon$-irrelevant，如果删除、合并或不展开它之后，最终输出分布变化小于 $\varepsilon$。

可以用 KL divergence 写成：

$$
\Delta_i =
D_{\mathrm{KL}}\left(
p_{\mathrm{full}}(y_t\mid x_{\le t})
\;\|\;
p_{\mathrm{compressed/no}\ i}(y_t\mid x_{\le t})
\right)
$$

如果 $\Delta_i$ 很小，它对这个预测就是低贡献；但这只是局部贡献判断，不能变成对该 token 的永久判决。

## 4. 为什么不能只靠 top-k：所以有 SWA 和 HCA

如果只做远程 top-k，会立刻遇到一类很硬的问题：局部语法、短程引用、当前句子结构、代码缩进、括号匹配，都需要最近 token 的细粒度信息。

DeepSeek-V4 额外保留了 Sliding Window Attention。报告也解释了原因：CSA/HCA 的 query 只能 attend 到 preceding compressed blocks，不能访问自己所在压缩块内部的所有细节；同时语言建模里 recent tokens 往往更相关。因此 V4 额外保留最近 $n_{\mathrm{win}}$ 个未压缩 KV entries 来建模局部依赖。

于是三条分支形成了一个清晰分工：

| 分支 | 作用 | 信息形态 |
| --- | --- | --- |
| SWA | 最近上下文细节 | 未压缩 token |
| CSA | 远程重点证据 | 中等压缩 + top-k 检索 |
| HCA | 全局背景/粗摘要 | 重压缩 + dense attention |

这说明 DeepSeek-V4 的方案没有把全部赌注压在“top-k 万能”上。它的设计更像多分辨率记忆：最近处用高清，远处用缩略图，需要的时候再点开关键缩略图。

## 5. 它为什么能训练出来：模型从一开始就在这个瓶颈下学习

如果拿一个 full-attention 模型，在推理时突然把 KV 压缩再 top-k，效果大概率会崩。因为原模型没有学过如何把信息写进这种记忆格式，也没有学过如何从这种记忆格式里读。

DeepSeek-V4 的关键在于：压缩器、indexer、attention、后面的 MLP/MoE 是一起训练的。

报告里的训练路径很重要：训练从较短序列开始，逐步扩展到 16K、64K、1M；稀疏注意力并未在一开始启用，训练先进行 dense attention warmup，之后在 64K 阶段引入 sparse attention，并先 warm up CSA 的 lightning indexer，再在大部分训练中使用 sparse attention。

这意味着模型会逐渐学会四件事：

1. 早期层把局部信息写进更容易压缩的 hidden state。
2. 压缩器学习保留未来 query 可能需要的特征。
3. indexer 学习根据 query 找相关 block。
4. 后续层学习利用这种不完整但高效的记忆。

所以关键表述应该换成：模型从训练时就知道自己只能这样读历史，并围绕这种读取方式组织内部表示。

## 6. top-k 的问题本质：预算约束下的注意力近似

可以把这个机制定义成一个带 KV/FLOPs 预算的优化问题。

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

这个问题可以从三个角度理解。

### A. Rate-distortion / 信息瓶颈

每个 block 原来有 $m$ 个 token 的 KV，现在只能存一个 vector。目标从保留全部信息转向在固定 memory rate 下最小化预测损失：

$$
\min_\Phi \mathbb{E}[\mathrm{distortion}]
\quad
\mathrm{s.t.}\quad
\mathrm{memory\ budget}
$$

这里的 distortion 可以是 hidden-state 误差、attention-output 误差，也可以直接是 next-token loss。

### B. Learned retrieval / 学出来的检索器

top-k 选择可以看成检索问题：给定 query $q_t$，从所有 block memory $z_b$ 中找最相关的 block。

理想相关性可以定义为 dense attention 下的 block mass：

$$
r_{t,b}=\sum_{i\in b}\alpha_{t,i}
$$

oracle top-k 就是选择 $r_{t,b}$ 最大的 block。实际 indexer 要学一个更便宜的打分函数：

$$
g_\psi(q_t,z_b)\approx r_{t,b}
$$

### C. End-to-end loss minimization

最真实的目标是生成质量，无需逐项复现 dense attention。因此，即使某些 block 在 dense attention 里有质量，只要删掉后最终 token 分布基本不变，就可以不选。

最终标准更接近：

$$
D_{\mathrm{KL}}(p_{\mathrm{full}}\|p_{\mathrm{sparse\text{-}compressed}})
$$

或者更直接：

$$
\Delta \mathrm{NLL}
=
-\log p_{\mathrm{sparse}}(y_t)
+
\log p_{\mathrm{full}}(y_t)
$$

## 7. 怎么分析它有没有选对

如果要研究 CSA/HCA 是否真的在做合理近似，可以看几类诊断信号。

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

如果 CapturedMass@k 很高，说明 top-k 近似在该分布下是合理的。

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

报告中提到，CSA indexer 的 QK path 使用 FP4、index scores 从 FP32 量化到 BF16 后，top-k selector 获得 2x 加速，同时保持 99.7% 的 KV entry recall。这里的 recall 用来验证“低精度加速后选出来的 KV entry 是否接近原 selector”，还不足以证明 sparse attention 与 full attention 完全等价。

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

如果这个差异小，说明 compressed entry 对当前 query 的表达力足够。

### 4. Ablation 曲线

改变 $m,k,m',n_{\mathrm{win}}$，观察 perplexity、LongBench、needle-in-haystack、多证据问答、代码任务的变化。最终会得到一条 Pareto curve：

$$
\mathrm{quality}
\leftrightarrow
\mathrm{KV\ memory/FLOPs}
$$

报告中，LongBench-V2 上 DeepSeek-V3.2-Base 为 40.2，V4-Flash-Base 为 44.7，V4-Pro-Base 为 51.5。这个结果说明 V4 系列在长上下文评测上更强，但不能单独归因于 CSA/HCA，因为数据、规模、训练策略和优化器也一起变了。

### 5. Adversarial / worst-case 测试

最容易暴露稀疏检索问题的，是那些需要均匀读取全文的任务：

1. 统计全文某个词出现次数。
2. 比较 1000 个分散证据。
3. 每段都有一个小事实，最终答案依赖全部事实。
4. needle 很短，且和 query 的语义相关性很弱。
5. 需要逐 token 级别精确复原。

这类任务中，“少数 top-k block 足够”的假设可能不成立。HCA 可以帮助保留全局 aggregate，但如果任务要求精确保留所有细节，压缩一定会带来信息损失。

## 8. DeepSeek-V4 到底相信了哪些假设

这类设计背后有几个经验假设。

**假设 1：远程依赖通常是稀疏的。** 百万 token 里，对当前生成真正有用的远程片段通常是少数。

**假设 2：局部依赖最重要，所以最近 token 要原样保留。** 这就是 SWA 的作用。

**假设 3：远处很多信息可以摘要化。** 不需要每个 token 的完整 KV，只需要某种面向未来 query 的 memory representation。

**假设 4：模型可以通过训练适应这种记忆格式。** V4 在长上下文训练中逐步引入 sparse attention，并 warm up indexer，记忆格式从训练阶段就进入模型能力边界。

**假设 5：真实任务分布通常避开最坏情况。** 如果用户构造一个必须均匀读取全上下文的算法题，top-k sparse attention 可能比 full attention 更吃亏。

## 9. 一句话总结

DeepSeek-V4 的 KV 压缩可以这样总结：

> 在给定生成位置上，大多数历史 token 不需要以原始 KV 形式被逐个读取；它们要么可被局部摘要表示，要么当前 query 不需要，要么由全局压缩分支覆盖。真正要优化的是在 KV/FLOPs 预算下，让最终 next-token loss 尽量接近 full attention。

所以这个问题最合理的建模方式是：

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

top-k 判断的是当前 query 是否值得花计算预算把这个 memory block 展开读。
