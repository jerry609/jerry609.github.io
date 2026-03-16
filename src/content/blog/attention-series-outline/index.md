---
title: "Attention 机制完全指南：16 讲从直觉到工程"
description: "一套完整的 Attention 学习路径，覆盖直觉、公式、变体和工程实现。"
publishDate: "2026-03-16"
tags: ["LLM", "Transformer", "Attention", "专题", "学习路径"]
language: "zh-CN"
draft: false
---

这个系列的目标很简单：**把 Attention 从头到尾讲一遍，每一讲只解决一个问题，讲完之后能接住下一讲。**

不搞"一篇讲完 Attention"——那种文章要么只讲了直觉没落到公式，要么公式推完了不知道 GPT 推理时到底在干嘛。这里拆成三个阶段：

- **第 1–5 讲**：建立概念，理解 Q / K / V 和完整公式
- **第 6–10 讲**：深入机制，搞清 Mask、Multi-Head、Self vs Cross
- **第 11–16 讲**：接上工程，训练/推理差异、KV Cache、代码实现

每一讲都带交互演示和公式推导。

---

## 已发布

- [第 1 讲：为什么需要 Attention](/blog/attention-01-why-attention/)
- [第 2 讲：Q / K / V 直觉](/blog/attention-02-qkv-intuition/)
- [第 3 讲：单头注意力的完整计算流程](/blog/attention-03-single-head-math/)
- [第 4 讲：为什么 QKᵀ 表示词与词的关系](/blog/attention-04-qkt-meaning/)

---

## 第一阶段：概念与公式

### 第 1 讲：为什么需要 Attention

RNN 把整句话压成一个固定向量，长句信息必然丢失。Attention 的核心动作就是：**让每一步输出都能动态地从不同输入位置取信息。**

### 第 2 讲：Q / K / V 直觉

Query 是"我想找什么"，Key 是"我能匹配什么"，Value 是"匹配到了我能提供什么"。用图书馆查资料的类比把三个角色讲清楚，不急着上公式。

### 第 3 讲：单头注意力完整计算流程

拿一个 3 词的短句手推一遍：$X \to Q, K, V \to QK^\top / \sqrt{d_k} \to \text{softmax} \to \alpha V \to \text{Output}$。每一步写明维度，附 PyTorch 代码。

### 第 4 讲：为什么 $QK^\top$ 表示词与词的关系

点积衡量的是方向相似性。$QK^\top$ 不是固定的语言学标签，而是模型学到的"当前查询需求"与"候选位置可提供线索"之间的匹配度。顺便解释为什么不能直接用 $XX^\top$。

### 第 5 讲：softmax 为什么是注意力权重

非负、归一化、放大差异但不绝对独占。softmax 把分数变成了信息分配比例。

---

## 第二阶段：机制深入

### 第 6 讲：为什么是加权求和而不是取最大值

hard attention 丢信息且不可微。soft attention 能同时整合多个来源，并且允许梯度流过。

### 第 7 讲：输出还是向量，但已经带上了上下文

输入 $\mathbf{x}_i$ 是静态词义，输出 $\mathbf{o}_i$ 是融合上下文后的动态表示。形式相同，信息量完全不同。这一讲接上 BERT / GPT 的表示学习。

### 第 8 讲：Mask Attention

GPT 不能看未来 token。做法很直接：在 softmax 之前把未来位置的分数设为 $-\infty$。训练时整句并行，但每个位置只依赖左侧上下文。

### 第 9 讲：多头注意力

不同的头有不同的 $W^Q, W^K, W^V$，在不同子空间学不同关系。最后 concat + $W^O$ 融合。"多头"不是"并行跑几次 attention"那么简单。

### 第 10 讲：Self / Cross / Masked Self-Attention

三种形式公式几乎一样，区别在 Q / K / V 的来源。Self-Attention：同一序列；Masked Self-Attention：加因果遮罩；Cross-Attention：Q 来自解码器，K / V 来自编码器。BERT 用双向，GPT 用因果。

---

## 第三阶段：工程落地

### 第 11 讲：训练 vs 推理

训练时整句已知，可以并行矩阵计算。推理时未来 token 不存在，只能逐 token 生成。两者遵守同一个因果约束，但输入可获得性不同。

### 第 12 讲：KV Cache

历史 token 的 K / V 不会变，缓存起来避免重复计算。当前步的 Q 是新 token 才有的，每步都要新算。这就是为什么只缓存 K 和 V。

### 第 13 讲：Attention 的几何视角

点积是余弦相似度的缩放版。线性投影让同一个输入有了不同角色。多头拆分降维后表达能力并没有消失。

### 第 14 讲：Transformer Block 全流程

Attention 只是 Block 的一部分。残差连接保留原始信息，LayerNorm 稳定训练，FFN 提供逐位置的非线性变换。

### 第 15 讲：复杂度与长序列

$QK^\top$ 是 $O(n^2)$ 的，长上下文显存爆炸。Flash Attention 用分块和 kernel fusion 解决。稀疏注意力和滑动窗口是另一条路。

### 第 16 讲：从公式到代码

PyTorch 实现单头、多头、causal mask 和 KV Cache。不只贴代码，而是把"公式的哪一部分对应代码的哪一行"逐行对齐。
