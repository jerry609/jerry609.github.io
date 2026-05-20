---
title: 'Post-LN Transformer 为什么需要 Warmup？'
description: '从 LayerNorm 反向传播和平均场尺度分析出发，解释 Post-LN 初始化阶段的层间梯度失衡以及 warmup 的作用。'
publishDate: '2026-05-21'
tags: ['transformer', 'layernorm', 'warmup', 'optimization', 'paper-reading']
language: 'zh-CN'
draft: false
---

Transformer 训练里有一个经典经验：原始 Transformer 和 BERT 风格的 Post-LN 架构通常需要 learning rate warmup。训练一开始不能直接使用目标学习率，而是要先从很小的学习率开始，再逐步升到最大值。

ICML 2020 论文 [On Layer Normalization in the Transformer Architecture][1] 给出了一个理论解释：warmup 的需求不只是优化器技巧，也来自 LayerNorm 放置位置改变了初始化阶段的梯度尺度。论文的核心并不是简单说“最后一层 LN 让所有梯度爆炸”，更精确地说：

> Post-LN 在初始化时让靠近输出端的参数梯度过大，且这种大梯度无法随着深度增加被自然稀释；同时靠近输入端的梯度会沿层数向前衰减，形成严重的层间梯度尺度失衡。

论文通过平均场分析给出这一点，并用实验说明 warmup 对 Post-LN 训练很关键。下面按机制链展开。

## 1. Post-LN 和 Pre-LN 的结构差异

设第 $l$ 层、第 $i$ 个 token 的 hidden state 为：

$$
x_{l,i}\in \mathbb{R}^d,
$$

其中 $d$ 是 hidden dimension，$l=1,\ldots,L$，$L$ 是层数。

LayerNorm 定义为：

$$
\operatorname{LN}(v)
=
\gamma \frac{v-\mu(v)\mathbf{1}}{\sigma(v)}+\beta,
$$

其中：

$$
\mu(v)=\frac{1}{d}\sum_{k=1}^{d}v_k,
$$

$$
\sigma^2(v)
=
\frac{1}{d}\sum_{k=1}^{d}(v_k-\mu(v))^2.
$$

ICML 2020 论文中讨论的 Post-LN 是原始 Transformer / BERT 常见形式：先做子层变换，再加残差，再做 LayerNorm。抽象写成：

$$
x_{l+1}
=
\operatorname{LN}\bigl(x_l+F_l(x_l)\bigr).
$$

Pre-LN 则把 LayerNorm 放到子层内部，残差主干外侧保持直接相加：

$$
x_{l+1}
=
x_l+F_l(\operatorname{LN}(x_l)).
$$

论文表格中也明确区分了这两种顺序：Post-LN 采用 self-attention / FFN sub-layer $\rightarrow$ residual connection $\rightarrow$ layer normalization；Pre-LN 把 LayerNorm 放进 residual block 内部，并在预测前额外加 final LayerNorm。

这两个式子的差别非常关键。Post-LN 每一层输出都会被归一化：

$$
\|x_{l+1}\|_2^2\approx d.
$$

Pre-LN 的残差路径则持续累积：

$$
x_{l+1}=x_l+\Delta_l,
$$

因此 $\|x_{l+1}\|_2^2$ 会随层数 $l$ 增长。

## 2. Warmup 的形式：先限制早期更新幅度

论文把第 $t$ 次迭代的学习率写成 $\operatorname{lr}(t)$，最大学习率写成 $\operatorname{lr}_{\max}$，warmup 步数写成 $T_{\mathrm{warmup}}$。在 warmup 阶段，学习率线性增长：

$$
\operatorname{lr}(t)
=
\frac{t}{T_{\mathrm{warmup}}}
\operatorname{lr}_{\max},
\qquad
t\leq T_{\mathrm{warmup}}.
$$

当 $t=1$ 时：

$$
\operatorname{lr}(1)
=
\frac{1}{T_{\mathrm{warmup}}}
\operatorname{lr}_{\max}.
$$

当 $t=\frac{1}{2}T_{\mathrm{warmup}}$ 时：

$$
\operatorname{lr}(t)
=
\frac{1}{2}\operatorname{lr}_{\max}.
$$

当 $t=T_{\mathrm{warmup}}$ 时：

$$
\operatorname{lr}(T_{\mathrm{warmup}})
=
\operatorname{lr}_{\max}.
$$

所以 warmup 的直接作用是：在参数最脆弱、梯度尺度最不均衡的初始化阶段，把更新量压小。

$$
\Delta\theta_t
=
-\operatorname{lr}(t)\nabla_\theta \mathcal{L}_t.
$$

论文实验显示，在 Post-LN Transformer 上，去掉 warmup 会导致显著性能下降。以 IWSLT14 De-En 为例，Adam 无 warmup 的 BLEU 只有 8.45，而使用 warmup 后可以达到约 34。

## 3. LayerNorm 的反向传播为什么会改变梯度尺度

为了看清问题，先忽略 $\gamma,\beta$，写标准 LayerNorm：

$$
\operatorname{LN}(x)
=
\frac{x-\mu(x)\mathbf{1}}{\sigma(x)}.
$$

定义中心化矩阵：

$$
P
=
I-\frac{1}{d}\mathbf{1}\mathbf{1}^{\top}.
$$

于是：

$$
x-\mu(x)\mathbf{1}
=
Px.
$$

令：

$$
c=Px.
$$

则 $\mu(c)=0$，并且：

$$
\sigma^2(x)
=
\frac{1}{d}\|c\|_2^2.
$$

因此：

$$
\sigma(x)=\frac{\|c\|_2}{\sqrt d}.
$$

所以 LayerNorm 可以写成：

$$
\operatorname{LN}(x)
=
\frac{c}{\|c\|_2/\sqrt d}
=
\sqrt d\frac{c}{\|c\|_2}.
$$

现在求 Jacobian。设：

$$
r=\|c\|_2.
$$

那么：

$$
\operatorname{LN}(x)
=
\sqrt d \frac{c}{r}.
$$

对 $x$ 求微分：

$$
dc=Pdx.
$$

又因为：

$$
r=(c^\top c)^{1/2},
$$

所以：

$$
dr
=
\frac{1}{2}(c^\top c)^{-1/2}\cdot 2c^\top dc
=
\frac{c^\top dc}{\|c\|_2}
=
\frac{c^\top Pdx}{r}.
$$

接着对 $\frac{c}{r}$ 求微分：

$$
d\left(\frac{c}{r}\right)
=
\frac{1}{r}dc-\frac{c}{r^2}dr.
$$

代入 $dc=Pdx$ 和 $dr=\frac{c^\top Pdx}{r}$：

$$
d\left(\frac{c}{r}\right)
=
\frac{1}{r}Pdx
-
\frac{c}{r^2}\cdot \frac{c^\top Pdx}{r}.
$$

整理为：

$$
d\left(\frac{c}{r}\right)
=
\left(
\frac{1}{r}P
-
\frac{cc^\top P}{r^3}
\right)dx.
$$

因为 $c=Px$，且 $Pc=c$，所以可以写成：

$$
J_{\operatorname{LN}}(x)
=
\frac{\partial \operatorname{LN}(x)}{\partial x}
=
\sqrt d
\left(
\frac{1}{\|c\|_2}P
-
\frac{cc^\top P}{\|c\|_2^3}
\right).
$$

提取公共项：

$$
J_{\operatorname{LN}}(x)
=
\frac{\sqrt d}{\|c\|_2}
\left(
P-\frac{cc^\top}{\|c\|_2^2}
\right).
$$

矩阵

$$
P-\frac{cc^\top}{\|c\|_2^2}
$$

可以理解为在去均值子空间里，再去掉 $c$ 方向的投影。它的谱范数不超过常数阶，因此：

$$
\|J_{\operatorname{LN}}(x)\|_2
=
O\left(\frac{\sqrt d}{\|c\|_2}\right).
$$

在均值项不主导的随机初始化情形下，$\|c\|_2\approx \|x\|_2$，于是得到论文 Lemma 3 使用的关键尺度关系：

$$
\|J_{\operatorname{LN}}(x)\|_2
=
O\left(\frac{\sqrt d}{\|x\|_2}\right).
$$

这就是 LayerNorm 反向传播的核心机制：

> 输入向量范数越大，LayerNorm 的反向 Jacobian 越小；输入向量范数越小，反向 Jacobian 越大。

## 4. Post-LN 的前向尺度：每层输出被重置

Post-LN 的一层可以抽象成：

$$
x_{l+1}
=
\operatorname{LN}(x_l+F_l(x_l)).
$$

由于 LayerNorm 会把输出重新缩放到单位方差，每一维的方差大约为 1，因此：

$$
\mathbb{E}\|x_{l+1}\|_2^2
\approx
d.
$$

更细一点看 FFN。论文使用简化的初始化设置：权重矩阵使用 Xavier 初始化，偏置为零；理论分析中把多头注意力简化为单头，并令部分注意力权重在初始化时产生均匀注意力。Xavier 初始化中，若矩阵大小为 $d\times d$，每个元素的方差约为：

$$
\operatorname{Var}(W_{ij})=\frac{1}{d}.
$$

设 FFN 第一层输入为 $h$，并且：

$$
\|h\|_2^2\approx d.
$$

第一层线性变换为：

$$
a=hW_1.
$$

第 $j$ 个分量为：

$$
a_j=\sum_{k=1}^{d}h_k(W_1)_{kj}.
$$

因为：

$$
\mathbb{E}(W_1)_{kj}=0,
\qquad
\operatorname{Var}((W_1)_{kj})=\frac{1}{d},
$$

所以：

$$
\operatorname{Var}(a_j)
=
\sum_{k=1}^{d}h_k^2\operatorname{Var}((W_1)_{kj})
=
\frac{1}{d}\sum_{k=1}^{d}h_k^2
=
\frac{\|h\|_2^2}{d}
\approx
1.
$$

因此可以近似认为：

$$
a_j\sim \mathcal{N}(0,1).
$$

经过 ReLU：

$$
z_j=\operatorname{ReLU}(a_j)=\max(a_j,0).
$$

如果：

$$
A\sim\mathcal{N}(0,\sigma^2),
$$

则：

$$
\mathbb{E}[\operatorname{ReLU}(A)^2]
=
\mathbb{E}[A^2\mathbf{1}_{A>0}].
$$

由于正态分布关于 0 对称：

$$
\mathbb{E}[A^2\mathbf{1}_{A>0}]
=
\frac{1}{2}\mathbb{E}[A^2]
=
\frac{1}{2}\sigma^2.
$$

对 $d$ 个维度求和：

$$
\mathbb{E}\|\operatorname{ReLU}(a)\|_2^2
=
\sum_{j=1}^{d}\mathbb{E}[\operatorname{ReLU}(a_j)^2]
=
\frac{1}{2}\sigma^2 d.
$$

这就是论文 Lemma 1 的核心形式：

$$
X\sim\mathcal{N}(0,\sigma^2 I_d)
\quad\Longrightarrow\quad
\mathbb{E}\|\operatorname{ReLU}(X)\|_2^2
=
\frac{1}{2}\sigma^2 d.
$$

接着，第二层线性变换为：

$$
f=zW_2.
$$

同理，若 $\operatorname{Var}((W_2)_{ij})=1/d$，则：

$$
\mathbb{E}\|zW_2\|_2^2
\approx
\|z\|_2^2.
$$

因此：

$$
\mathbb{E}\|f\|_2^2
\approx
\frac{1}{2}d.
$$

Post-LN 的 FFN 残差前状态可以写成：

$$
x^{\mathrm{post},5}_{l,i}
=
x^{\mathrm{post},3}_{l,i}
+
x^{\mathrm{post},4}_{l,i}.
$$

其中：

$$
\mathbb{E}\|x^{\mathrm{post},3}_{l,i}\|_2^2\approx d,
$$

$$
\mathbb{E}\|x^{\mathrm{post},4}_{l,i}\|_2^2\approx \frac{1}{2}d.
$$

交叉项在随机初始化下均值近似为 0：

$$
\mathbb{E}
\left[
2\left\langle
x^{\mathrm{post},3}_{l,i},
x^{\mathrm{post},4}_{l,i}
\right\rangle
\right]
\approx
0.
$$

所以：

$$
\mathbb{E}\|x^{\mathrm{post},5}_{l,i}\|_2^2
=
\mathbb{E}\|x^{\mathrm{post},3}_{l,i}\|_2^2
+
\mathbb{E}\|x^{\mathrm{post},4}_{l,i}\|_2^2
\approx
d+\frac{1}{2}d
=
\frac{3}{2}d.
$$

论文 Lemma 2 给出的 Post-LN 形式正是：

$$
\mathbb{E}\|x^{\mathrm{post},5}_{l,i}\|_2^2
=
\frac{3}{2}d.
$$

随后 Post-LN 立刻做：

$$
x^{\mathrm{post}}_{l+1,i}
=
\operatorname{LN}(x^{\mathrm{post},5}_{l,i}),
$$

因此输出被重新拉回：

$$
\|x^{\mathrm{post}}_{l+1,i}\|_2^2\approx d.
$$

这意味着：Post-LN 每一层都在前向传播中重置 hidden state 的尺度。

## 5. Pre-LN 的前向尺度：残差路径随深度累积

Pre-LN 的一层形式是：

$$
x_{l+1}
=
x_l+F_l(\operatorname{LN}(x_l)).
$$

由于 LayerNorm 放在子层输入处，子层看到的是归一化后的表示：

$$
\operatorname{LN}(x_l).
$$

因此：

$$
\|\operatorname{LN}(x_l)\|_2^2\approx d.
$$

子层输出：

$$
F_l(\operatorname{LN}(x_l))
$$

的尺度大约也是 $O(\sqrt d)$。但是 Pre-LN 的残差加法之后没有立刻做外层 LayerNorm，因此：

$$
x_{l+1}
=
x_l+\Delta_l,
$$

其中：

$$
\Delta_l=F_l(\operatorname{LN}(x_l)).
$$

展开平方范数：

$$
\|x_{l+1}\|_2^2
=
\|x_l+\Delta_l\|_2^2
=
\|x_l\|_2^2
+
\|\Delta_l\|_2^2
+
2\langle x_l,\Delta_l\rangle.
$$

在随机初始化下，残差增量和当前 hidden state 的方向近似不相关，所以：

$$
\mathbb{E}\langle x_l,\Delta_l\rangle\approx 0.
$$

于是：

$$
\mathbb{E}\|x_{l+1}\|_2^2
\approx
\mathbb{E}\|x_l\|_2^2
+
\mathbb{E}\|\Delta_l\|_2^2.
$$

如果每层新增的能量是 $O(d)$，那么递推得到：

$$
\mathbb{E}\|x_{L+1}\|_2^2
\approx
\mathbb{E}\|x_1\|_2^2
+
O(Ld)
=
O(Ld).
$$

因此：

$$
\|x_{L+1}\|_2
=
O(\sqrt{Ld}).
$$

论文 Lemma 2 给出了更具体的上下界：

$$
\left(1+\frac{l}{2}\right)d
\leq
\mathbb{E}\|x^{\mathrm{pre}}_{l,i}\|_2^2
\leq
\left(1+\frac{3l}{2}\right)d.
$$

这说明 Pre-LN 的 hidden state 能量会随深度线性增长。

## 6. 核心机制：Pre-LN 多了深度缩放

现在回到 LayerNorm 的 Jacobian：

$$
\|J_{\operatorname{LN}}(x)\|_2
=
O\left(\frac{\sqrt d}{\|x\|_2}\right).
$$

### Post-LN 的最后一层

Post-LN 最后一层 FFN 后，会进入一个 LayerNorm：

$$
x^{\mathrm{post}}_{L+1}
=
\operatorname{LN}(x^{\mathrm{post},5}_{L}).
$$

根据 Lemma 2：

$$
\mathbb{E}\|x^{\mathrm{post},5}_{L}\|_2^2
=
\frac{3}{2}d.
$$

因此：

$$
\|x^{\mathrm{post},5}_{L}\|_2
\approx
\sqrt{\frac{3}{2}d}.
$$

代入 Jacobian 尺度：

$$
\|J_{\operatorname{LN}}(x^{\mathrm{post},5}_{L})\|_2
=
O\left(
\frac{\sqrt d}{\sqrt{\frac{3}{2}d}}
\right)
=
O(1).
$$

关键点是：这个量不随 $L$ 减小。

### Pre-LN 的最后一层

Pre-LN 在预测前有 final LayerNorm：

$$
x^{\mathrm{pre}}_{\mathrm{Final}}
=
\operatorname{LN}(x^{\mathrm{pre}}_{L+1}).
$$

根据 Pre-LN 的前向尺度：

$$
\|x^{\mathrm{pre}}_{L+1}\|_2^2
=
O(Ld).
$$

因此：

$$
\|x^{\mathrm{pre}}_{L+1}\|_2
=
O(\sqrt{Ld}).
$$

代入 LayerNorm Jacobian：

$$
\|J_{\operatorname{LN}}(x^{\mathrm{pre}}_{L+1})\|_2
=
O\left(
\frac{\sqrt d}{\sqrt{Ld}}
\right)
=
O\left(\frac{1}{\sqrt L}\right).
$$

这就是论文结论的核心：Pre-LN 的 final LayerNorm 输入能量随 $L$ 增长，因此反向传播时会自然带来一个 $1/\sqrt L$ 的缩放；Post-LN 每层都把 hidden state 重置到 $\sqrt d$，最后一层附近的梯度没有这个 $1/\sqrt L$ 缓冲。

## 7. 最后一层 FFN 参数梯度的量级

论文 Theorem 1 研究最后一层 FFN 的第二个权重矩阵：

$$
W_{2,L}.
$$

在单个位置上，FFN 可以写成：

$$
\operatorname{FFN}(h)
=
\operatorname{ReLU}(hW_{1,L}+b_{1,L})W_{2,L}+b_{2,L}.
$$

令：

$$
r
=
\operatorname{ReLU}(hW_{1,L}+b_{1,L}).
$$

那么 FFN 输出为：

$$
f=rW_{2,L}+b_{2,L}.
$$

设损失为 $\mathcal{L}$，并令：

$$
g
=
\frac{\partial \mathcal{L}}{\partial f}.
$$

对 $W_{2,L}$ 求梯度：

$$
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
=
r^\top g.
$$

它的 Frobenius 范数满足：

$$
\left\|
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
\right\|_F
=
\|r^\top g\|_F.
$$

由于 $r^\top g$ 是外积，外积的 Frobenius 范数等于两个向量范数之积：

$$
\|r^\top g\|_F
=
\|r\|_2\|g\|_2.
$$

所以：

$$
\left\|
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
\right\|_F
=
\|r\|_2\|g\|_2.
$$

前面已经得到：

$$
\mathbb{E}\|r\|_2^2=O(d),
$$

因此：

$$
\|r\|_2=O(\sqrt d).
$$

接下来比较 $g$ 的尺度。

### Post-LN

Post-LN 中，最后 FFN 输出会经过外层 LN。记 softmax / loss 传回来的梯度为 $u$，则：

$$
g_{\mathrm{post}}
=
J_{\operatorname{LN}}(x^{\mathrm{post},5}_{L})^\top u.
$$

因此：

$$
\|g_{\mathrm{post}}\|_2
\leq
\|J_{\operatorname{LN}}(x^{\mathrm{post},5}_{L})\|_2
\cdot
\|u\|_2.
$$

Post-LN 里：

$$
\|J_{\operatorname{LN}}(x^{\mathrm{post},5}_{L})\|_2
=
O(1).
$$

高概率界中，softmax / embedding 相关梯度项会带来 $\sqrt{\ln d}$ 因子。可以把它理解为对 $d$ 个随机维度取最大量级时产生的对数修正。于是：

$$
\|u\|_2
=
O(\sqrt{d\ln d}).
$$

所以：

$$
\|g_{\mathrm{post}}\|_2
=
O(\sqrt{d\ln d}).
$$

代回 $W_{2,L}$ 的梯度：

$$
\left\|
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
\right\|_F
=
\|r\|_2\|g_{\mathrm{post}}\|_2
=
O(\sqrt d)\cdot O(\sqrt{d\ln d})
=
O(d\sqrt{\ln d}).
$$

论文 Theorem 1 的 Post-LN 结论正是：

$$
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
\leq
O(d\sqrt{\ln d}).
$$

### Pre-LN

Pre-LN 中 final LayerNorm 的输入范数是：

$$
\|x^{\mathrm{pre}}_{L+1}\|_2
=
O(\sqrt{Ld}).
$$

因此：

$$
\|J_{\operatorname{LN}}(x^{\mathrm{pre}}_{L+1})\|_2
=
O\left(\frac{1}{\sqrt L}\right).
$$

所以：

$$
\|g_{\mathrm{pre}}\|_2
\leq
O\left(\frac{1}{\sqrt L}\right)
\cdot
O(\sqrt{d\ln d})
=
O\left(\sqrt{\frac{d\ln d}{L}}\right).
$$

再乘上：

$$
\|r\|_2=O(\sqrt d),
$$

得到：

$$
\left\|
\frac{\partial \mathcal{L}}{\partial W_{2,L}}
\right\|_F
=
O(\sqrt d)
\cdot
O\left(\sqrt{\frac{d\ln d}{L}}\right)
=
O\left(
d\sqrt{\frac{\ln d}{L}}
\right).
$$

这就是论文 Theorem 1 的 Pre-LN 结论：

$$
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
\leq
O\left(
d\sqrt{\frac{\ln d}{L}}
\right).
$$

两者差异并不是“Post-LN 全部梯度爆炸，Pre-LN 全部梯度正常”这么粗糙。更准确地说，Post-LN 输出端参数在初始化时拿到更大的梯度，而且没有随深度增长而出现的自然缩放。

## 8. 为什么 Post-LN 会特别需要 Warmup

参数更新的基本形式是：

$$
\theta_{t+1}
=
\theta_t-\eta_t\nabla_\theta \mathcal{L}_t,
$$

其中：

$$
\eta_t=\operatorname{lr}(t).
$$

单步更新幅度大致为：

$$
\|\Delta\theta_t\|
=
\|\theta_{t+1}-\theta_t\|
\approx
\eta_t\|\nabla_\theta\mathcal{L}_t\|.
$$

对于 Post-LN 最后一层附近的参数，初始化时有：

$$
\|\nabla_{W_{2,L}}\mathcal{L}\|_F
=
O(d\sqrt{\ln d}).
$$

如果一开始直接使用最大学习率：

$$
\eta_t=\eta_{\max},
$$

那么更新尺度是：

$$
\|\Delta W_{2,L}\|_F
=
\eta_{\max}O(d\sqrt{\ln d}).
$$

当 $d$ 很大时，这个量可能过大。靠近输出端的参数会在训练最开始被剧烈改写，导致 logits、loss landscape、后续梯度统计一起发生剧烈变化。

warmup 把早期学习率改成：

$$
\eta_t
=
\frac{t}{T_{\mathrm{warmup}}}\eta_{\max}.
$$

于是更新尺度变成：

$$
\|\Delta W_{2,L}\|_F
=
\frac{t}{T_{\mathrm{warmup}}}
\eta_{\max}
O(d\sqrt{\ln d}).
$$

当 $t\ll T_{\mathrm{warmup}}$ 时：

$$
\frac{t}{T_{\mathrm{warmup}}}\ll 1,
$$

所以 $\|\Delta W_{2,L}\|_F$ 被显著压小。

这就是 warmup 的机制解释：

$$
\text{large initial gradient}
\quad
\xrightarrow{\text{small early lr}}
\quad
\text{controlled update}.
$$

它不改变 Post-LN 的结构性梯度失衡，只是在训练早期降低学习率，避免靠近输出层的参数被过度更新。

论文也指出，Post-LN 中靠近输出端的梯度较大，且向较低层传播时会随层 index 降低而衰减；Pre-LN 中不同层的梯度更倾向于保持同一尺度。

## 9. 输出层梯度大、输入层梯度小的机制链

Post-LN 的反向传播会反复穿过 LayerNorm。对第 $l$ 层附近的梯度，可以抽象写成：

$$
g_l
=
J_l^\top g_{l+1},
$$

其中：

$$
J_l
=
\frac{\partial x_{l+1}}{\partial x_l}.
$$

在 Post-LN 中，每层都有外层归一化：

$$
x_{l+1}
=
\operatorname{LN}(x_l+F_l(x_l)).
$$

因此：

$$
J_l
=
J_{\operatorname{LN}}(x_l+F_l(x_l))
\cdot
\left(I+\frac{\partial F_l(x_l)}{\partial x_l}\right).
$$

反向传播时：

$$
g_l
=
\left(I+\frac{\partial F_l(x_l)}{\partial x_l}\right)^\top
J_{\operatorname{LN}}(x_l+F_l(x_l))^\top
g_{l+1}.
$$

如果从第 $L$ 层一路传到第 $l$ 层，就会出现连乘：

$$
g_l
=
\prod_{k=l}^{L}
\left[
\left(I+\frac{\partial F_k(x_k)}{\partial x_k}\right)^\top
J_{\operatorname{LN}}(x_k+F_k(x_k))^\top
\right]
g_{L+1}.
$$

梯度范数可以粗略上界为：

$$
\|g_l\|_2
\leq
\prod_{k=l}^{L}
\left\|
I+\frac{\partial F_k(x_k)}{\partial x_k}
\right\|_2
\cdot
\left\|
J_{\operatorname{LN}}(x_k+F_k(x_k))
\right\|_2
\cdot
\|g_{L+1}\|_2.
$$

每经过一个外层 LayerNorm，梯度都会被它的 Jacobian 调制。Post-LN 的浅层需要穿过更多这样的外层归一化路径，因此更容易出现梯度衰减；靠近输出端的参数路径更短，受到的连续缩放更少，于是梯度更大。

最终形成一种层间不均衡：

$$
\|\nabla_{\theta_L}\mathcal{L}\|
\gg
\|\nabla_{\theta_1}\mathcal{L}\|.
$$

优化上表现为：

$$
\Delta\theta_L
=
-\eta\nabla_{\theta_L}\mathcal{L}
$$

很大，而：

$$
\Delta\theta_1
=
-\eta\nabla_{\theta_1}\mathcal{L}
$$

很小。

所以初始化阶段的 Post-LN 训练具有两个同时存在的风险：

1. 输出端参数更新过猛；
2. 输入端参数学习过慢。

warmup 主要缓解第一点：把输出端的大梯度更新压住。它对第二点的帮助是间接的，因为训练过程稳定下来后，浅层梯度统计会逐渐进入可学习区域。

## 10. 结论：Warmup 是 Post-LN 的训练保险丝

Post-LN 的训练问题可以压缩成一条机制链：

$$
\text{LN outside residual}
\Rightarrow
\text{each layer output is renormalized to scale }\sqrt d
$$

$$
\Rightarrow
\text{last-layer LN input scale does not grow with }L
\Rightarrow
\|J_{\operatorname{LN}}\|_2=O(1)
$$

$$
\Rightarrow
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
=
O(d\sqrt{\ln d})
$$

$$
\Rightarrow
\text{large initial learning rate causes unstable large updates}
\Rightarrow
\text{warmup reduces early update magnitude}.
$$

Pre-LN 的机制链则是：

$$
\text{LN inside residual}
\Rightarrow
\text{residual stream energy grows with depth}
\Rightarrow
\|x_{L+1}\|_2=O(\sqrt{Ld})
$$

$$
\Rightarrow
\|J_{\operatorname{LN}}(x_{L+1})\|_2
=
O(1/\sqrt L)
$$

$$
\Rightarrow
\left\|
\frac{\partial \widetilde{\mathcal{L}}}{\partial W_{2,L}}
\right\|_F
=
O\left(d\sqrt{\frac{\ln d}{L}}\right)
\Rightarrow
\text{initial gradients are better controlled}.
$$

因此，Post-LN 需要 warmup 的原因是：初始化阶段的梯度尺度在层间严重不均衡，输出端参数梯度过大，直接使用目标学习率容易造成不稳定更新。Warmup 通过降低早期学习率，把这些过大的初始更新限制在可控范围内。

ICML 2020 论文的实验也支持这一点：Post-LN 对 warmup 非常敏感，而 Pre-LN 可以在多个任务中移除 warmup，并保持可比性能与更快收敛。

[1]: https://proceedings.mlr.press/v119/xiong20b.html "On Layer Normalization in the Transformer Architecture"
