---
title: 'Post-LN Transformer 为什么需要 Warmup？'
description: '从 ICML 2020 论文的平均场分析出发，解释 Post-LN 初始化阶段的层间梯度尺度失衡，以及 warmup 为什么能压住输出端的大更新。'
publishDate: '2026-05-21'
tags: ['transformer', 'layernorm', 'warmup', 'optimization', 'paper-reading']
language: 'zh-CN'
draft: false
---

关于 Post-LN Transformer，有一个常见但容易讲过头的说法：

> 最后一层 LayerNorm 会让所有梯度爆炸，所以必须加 warmup。

这个说法抓住了一点直觉，但不够准确。ICML 2020 论文 [On Layer Normalization in the Transformer Architecture](https://proceedings.mlr.press/v119/xiong20b.html) 的结论更细：

> Post-LN 在初始化时让靠近输出端的参数梯度偏大，而且这种大梯度不会随着深度增加被自然稀释；与此同时，靠近输入端的梯度会沿层数向前衰减，形成严重的层间梯度尺度失衡。

所以 warmup 不是一个纯经验补丁。它真正压住的是训练最开始那几步的参数更新，尤其是输出端附近的大梯度更新。

本文只讨论初始化附近的尺度分析。为了看清主线，会省略常数、宽度相关的细节，以及注意力多头结构里的工程项。

## 1. Post-LN 与 Pre-LN 差在哪里

把第 $l$ 层的 hidden state 写成 $x_l$，子层变换写成 $F_l$。

Post-LN 的形式是：

$$
x_{l+1}
=
\operatorname{LN}\bigl(x_l+F_l(x_l)\bigr)
$$

也就是先做子层，接残差，再做 LayerNorm。原始 Transformer 和 BERT 风格的实现通常属于这一类。

Pre-LN 的形式是：

$$
x_{l+1}
=
x_l+F_l(\operatorname{LN}(x_l))
$$

LayerNorm 被移到子层内部，残差主干外面不再立刻归一化。实际做预测前，Pre-LN 通常还会加一个 final LayerNorm。

这个位置差异会改变前向尺度。Post-LN 每一层输出都会被拉回单位方差，因此

$$
\|x_{l+1}\|_2^2\approx d.
$$

Pre-LN 的残差流则会不断累积：

$$
x_{l+1}=x_l+\Delta_l.
$$

如果每层新增的残差能量是 $O(d)$，那么经过 $L$ 层后，hidden state 的能量会涨到 $O(Ld)$。

## 2. LayerNorm 反向传播的尺度事实

先忽略 LayerNorm 的可学习参数 $\gamma,\beta$，写成标准形式：

$$
\operatorname{LN}(x)
=
\frac{x-\mu(x)\mathbf{1}}{\sigma(x)}.
$$

定义中心化矩阵：

$$
P=I-\frac{1}{d}\mathbf{1}\mathbf{1}^{\top},
\qquad
c=Px.
$$

于是

$$
\operatorname{LN}(x)
=
\sqrt d\frac{c}{\|c\|_2}.
$$

对 $x$ 求 Jacobian，可以得到：

$$
J_{\operatorname{LN}}(x)
=
\frac{\sqrt d}{\|c\|_2}
\left(
P-\frac{cc^\top}{\|c\|_2^2}
\right).
$$

括号里的矩阵可以理解为投影项，谱范数是常数阶。因此 LayerNorm 的反向尺度主要由前面的系数决定：

$$
\|J_{\operatorname{LN}}(x)\|_2
=
O\left(\frac{\sqrt d}{\|x\|_2}\right).
$$

这句话很关键：输入 LayerNorm 的向量范数越大，反向传播经过它时缩得越多；输入范数越小，反向传播缩得越少。

论文的 Lemma 3 用的正是这个尺度关系。

## 3. Post-LN 没有自然的深度缓冲

先看 Post-LN 最后一层。最后一个 FFN 残差相加后会立刻进入 LayerNorm：

$$
x_{L+1}^{\mathrm{post}}
=
\operatorname{LN}(x_L^{\mathrm{post}}+F_L(x_L^{\mathrm{post}})).
$$

在论文的初始化假设下，FFN 残差相加前后的能量可以估到常数倍的 $d$。一个典型结论是：

$$
\mathbb{E}\|x_L^{\mathrm{post}}+F_L(x_L^{\mathrm{post}})\|_2^2
\approx
\frac{3}{2}d.
$$

所以最后一个 LayerNorm 的输入范数是 $O(\sqrt d)$。代回前面的 Jacobian 尺度：

$$
\|J_{\operatorname{LN}}\|_2
=
O\left(\frac{\sqrt d}{\sqrt d}\right)
=
O(1).
$$

它不会因为层数 $L$ 变大而自动缩小。

Pre-LN 不一样。它的残差流在每一层外侧持续相加。论文给出的尺度界可以写成：

$$
\left(1+\frac{l}{2}\right)d
\leq
\mathbb{E}\|x_l^{\mathrm{pre}}\|_2^2
\leq
\left(1+\frac{3l}{2}\right)d.
$$

到最后一层附近，final LayerNorm 的输入范数约为：

$$
\|x_{L+1}^{\mathrm{pre}}\|_2
=
O(\sqrt{Ld}).
$$

再代回 LayerNorm 的 Jacobian：

$$
\|J_{\operatorname{LN}}(x_{L+1}^{\mathrm{pre}})\|_2
=
O\left(\frac{\sqrt d}{\sqrt{Ld}}\right)
=
O\left(\frac{1}{\sqrt L}\right).
$$

这就是 Pre-LN 初始化更温和的原因之一：最后的 LayerNorm 在反向传播里天然带来一个 $1/\sqrt L$ 的缩放。

## 4. 最后一层 FFN 梯度为什么会变小一档

论文 Theorem 1 比较了最后一层 FFN 第二个权重矩阵 $W_{2,L}$ 的梯度。

把 FFN 写成：

$$
\operatorname{FFN}(h)
=
\operatorname{ReLU}(hW_{1,L}+b_{1,L})W_{2,L}+b_{2,L}.
$$

令

$$
r=\operatorname{ReLU}(hW_{1,L}+b_{1,L}),
\qquad
g=\frac{\partial \mathcal{L}}{\partial f}.
$$

那么

$$
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
=
r^\top g.
$$

外积的 Frobenius 范数等于两个向量范数相乘：

$$
\left\|
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
\right\|_F
=
\|r\|_2\|g\|_2.
$$

初始化时 $\|r\|_2=O(\sqrt d)$。差异主要落在 $g$ 上。

在 Post-LN 中，最后一层附近的 LayerNorm 反向尺度是 $O(1)$，因此输出端梯度不会随 $L$ 被压小。论文给出的高概率界为：

$$
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
\leq
O(d\sqrt{\ln d}).
$$

在 Pre-LN 中，final LayerNorm 带来 $1/\sqrt L$ 缩放，因此对应界变成：

$$
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
\leq
O\left(d\sqrt{\frac{\ln d}{L}}\right).
$$

两者不是简单的“炸”与“不炸”。更贴切的说法是：Post-LN 输出端参数在初始化时拿到更大的梯度，而且没有 Pre-LN 那个随深度增长而出现的自然缓冲。

## 5. 浅层为什么又会变小

Post-LN 的浅层梯度要从输出端一路反传回来。每过一层，都会经过类似下面的项：

$$
J_l
=
J_{\operatorname{LN}}(x_l+F_l(x_l))
\left(
I+\frac{\partial F_l(x_l)}{\partial x_l}
\right).
$$

反向传播到第 $l$ 层时，梯度会经历从 $l$ 到 $L$ 的连乘：

$$
g_l
=
\prod_{k=l}^{L}
\left[
\left(
I+\frac{\partial F_k(x_k)}{\partial x_k}
\right)^\top
J_{\operatorname{LN}}(x_k+F_k(x_k))^\top
\right]
g_{L+1}.
$$

越靠近输入端，路径越长，要穿过的外层 LayerNorm 越多。于是 Post-LN 在初始化阶段容易出现一种很别扭的分布：输出端参数梯度偏大，输入端参数梯度偏小。

这才是问题的核心。不是所有层一起爆炸，而是层间梯度尺度不均衡。

## 6. Warmup 到底在缓解什么

参数更新可以写成：

$$
\theta_{t+1}
=
\theta_t-\eta_t\nabla_\theta \mathcal{L}_t.
$$

如果一开始就使用目标学习率 $\eta_{\max}$，Post-LN 输出端的大梯度会直接转成大更新：

$$
\|\Delta W_{2,L}\|_F
\approx
\eta_{\max}O(d\sqrt{\ln d}).
$$

warmup 把前几步的学习率改成线性增长：

$$
\eta_t
=
\frac{t}{T_{\mathrm{warmup}}}\eta_{\max},
\qquad
t\leq T_{\mathrm{warmup}}.
$$

因此早期更新变成：

$$
\|\Delta W_{2,L}\|_F
\approx
\frac{t}{T_{\mathrm{warmup}}}
\eta_{\max}O(d\sqrt{\ln d}).
$$

当 $t\ll T_{\mathrm{warmup}}$ 时，前面的比例很小。warmup 没有改变 Post-LN 的结构性梯度失衡，但它让最危险的前几步不至于把输出端参数改得太猛。

论文的实验也支持这个解释。Post-LN 对 warmup 很敏感；在 IWSLT14 De-En 的实验设置中，去掉 warmup 会让性能明显掉下去，而使用 warmup 后训练稳定得多。Pre-LN 则可以在多个任务中移除 warmup，仍保持可比性能，并且往往收敛更快。

## 7. 一句话总结

Post-LN 需要 warmup，可以压成下面这条链：

$$
\text{LN outside residual}
\Rightarrow
\|x_l\|_2^2\approx d
\Rightarrow
\|J_{\operatorname{LN}}\|_2=O(1)
\Rightarrow
\|\nabla W_{2,L}\|_F=O(d\sqrt{\ln d})
\Rightarrow
\text{early update can be too large}.
$$

Pre-LN 的链条则是：

$$
\text{LN inside residual}
\Rightarrow
\|x_{L+1}\|_2^2=O(Ld)
\Rightarrow
\|J_{\operatorname{LN}}\|_2=O(1/\sqrt L)
\Rightarrow
\|\nabla W_{2,L}\|_F=
O\left(d\sqrt{\frac{\ln d}{L}}\right).
$$

所以更准确的结论是：

> Post-LN 的问题不是“最后一层 LN 让所有梯度爆炸”，而是初始化阶段的层间梯度尺度严重失衡。输出端参数梯度过大，浅层梯度又会沿反向路径衰减。Warmup 通过降低早期学习率，先把输出端的大更新压住，让训练有机会进入稳定区域。

主要参考：Ruibin Xiong et al., [On Layer Normalization in the Transformer Architecture](https://proceedings.mlr.press/v119/xiong20b.html), ICML 2020. [PDF](https://proceedings.mlr.press/v119/xiong20b/xiong20b.pdf)
