---
title: '从谱半径到随机 Jacobian 连乘'
description: '从 Gelfand 谱半径公式、标量随机乘积和 Furstenberg-Kesten 定理出发，把 Transformer 梯度传播写成随机 Jacobian 乘积的指数率问题。'
publishDate: '2026-05-21'
tags: ['transformer', 'gradient', 'random-matrix', 'lyapunov-exponent', 'optimization']
language: 'zh-CN'
draft: false
---

讨论深层网络的梯度传播时，最容易拿来用的一句话是：

> 如果 Jacobian 的谱半径小于 1，梯度消失；大于 1，梯度爆炸。

这句话在一个很窄的场景里是对的：每一层都使用同一个固定线性变换。但 Transformer 里的反向传播不是这么干净。每一层的 Jacobian 都依赖参数、输入、残差结构和 LayerNorm 的当前位置；把它们全部压成一个固定矩阵，会丢掉很多机制。

更合适的路线是：

$$
\text{fixed matrix}
\rightarrow
\text{random scalar product}
\rightarrow
\text{random matrix product}
\rightarrow
\text{random Jacobian product}.
$$

这样看，梯度稳定性不再只是一个谱半径问题，而是一个长期指数增长率问题。固定矩阵的指数率是 $\log \rho(A)$；标量随机乘积的指数率是 $\mathbb{E}\log a$；随机矩阵乘积的指数率则由最高 Lyapunov exponent 控制。

## 符号表

| 符号 | 含义 |
| --- | --- |
| $A$ | 固定矩阵，$A\in\mathbb{C}^{d\times d}$ |
| $\rho(A)$ | $A$ 的谱半径 |
| $\sigma(A)$ | $A$ 的特征值集合 |
| $a_i$ | 第 $i$ 步的随机标量缩放 |
| $M_i$ | 第 $i$ 步的随机矩阵 |
| $\Pi_n$ | 随机矩阵乘积 $M_nM_{n-1}\cdots M_1$ |
| $\lambda_1$ | 随机矩阵乘积的最高 Lyapunov exponent |
| $J_l$ | 第 $l$ 层前向映射的 Jacobian |
| $g_l$ | 第 $l$ 层的反向梯度 |
| $\eta_t$ | 第 $t$ 步学习率 |

## 1. 固定矩阵反复作用

设

$$
A\in\mathbb{C}^{d\times d},
\qquad
\sigma(A)=\{\lambda_1,\lambda_2,\ldots,\lambda_d\}.
$$

谱半径定义为：

$$
\rho(A)
=
\max_{\lambda_i\in\sigma(A)}|\lambda_i|.
$$

Gelfand 公式，也叫谱半径公式，给出：

$$
\rho(A)
=
\lim_{n\to\infty}\|A^n\|^{1/n}.
$$

取对数后就是：

$$
\log\rho(A)
=
\lim_{n\to\infty}
\frac{1}{n}\log\|A^n\|.
$$

含义很直接：一个固定线性变换反复作用时，长期指数增长率由最大模特征值控制。Tropp 的谱半径公式笔记也用初等矩阵方法证明了同一件事：对任意矩阵和任意矩阵范数，$\|A^n\|^{1/n}$ 都收敛到 $\rho(A)$。

证明骨架可以从 Jordan 分解看。写成：

$$
A=SJS^{-1},
\qquad
J=\operatorname{diag}(J_1,J_2,\ldots,J_m).
$$

于是

$$
A^n=SJ^nS^{-1}.
$$

由范数次乘性：

$$
\|A^n\|
\leq
\|S\|\,\|J^n\|\,\|S^{-1}\|.
$$

取 $n$ 次方根：

$$
\|A^n\|^{1/n}
\leq
\|S\|^{1/n}
\|J^n\|^{1/n}
\|S^{-1}\|^{1/n}.
$$

当 $n\to\infty$ 时，$\|S\|^{1/n}$ 和 $\|S^{-1}\|^{1/n}$ 都趋于 1，所以长期增长率只需要看 $\|J^n\|^{1/n}$。

对一个 Jordan block：

$$
J_\lambda=\lambda I+N,
\qquad
N^m=0.
$$

二项式展开给出：

$$
J_\lambda^n
=
(\lambda I+N)^n
=
\sum_{k=0}^{m-1}
\binom{n}{k}\lambda^{n-k}N^k.
$$

这里的 nilpotent 部分只带来多项式因子。可以写成：

$$
\|J_\lambda^n\|
\leq
C n^{m-1}|\lambda|^n.
$$

取 $n$ 次方根后，多项式项会消失：

$$
\|J_\lambda^n\|^{1/n}
\leq
C^{1/n}n^{(m-1)/n}|\lambda|
\to
|\lambda|.
$$

再结合特征方向上的下界，就得到：

$$
\lim_{n\to\infty}\|J_\lambda^n\|^{1/n}
=
|\lambda|.
$$

整个 $J$ 是 block diagonal，所以最终取最大 block：

$$
\lim_{n\to\infty}\|J^n\|^{1/n}
=
\max_i|\lambda_i|
=
\rho(A).
$$

如果一个深层网络的反向传播真的可以写成固定 Jacobian 的幂：

$$
g_0=A^Lg_L,
$$

那么长期尺度就是：

$$
\|g_0\|
\approx
\exp(L\log\rho(A))\|g_L\|.
$$

此时 $\rho(A)<1$ 对应指数衰减，$\rho(A)>1$ 对应指数增长，$\rho(A)\approx 1$ 对应临界传播。

## 2. 标量随机乘积

固定矩阵是乘法系统里最整齐的一种情况。先把矩阵问题降到一维，设每一步只是随机标量缩放：

$$
a_i>0,
\qquad
P_n=\prod_{i=1}^n a_i.
$$

乘法本身不容易求平均，但取对数后会变成加法：

$$
\log P_n
=
\log\left(\prod_{i=1}^n a_i\right)
=
\sum_{i=1}^n \log a_i.
$$

令

$$
X_i=\log a_i.
$$

如果 $X_i$ 独立同分布，并且 $\mathbb{E}|X_i|<\infty$，强大数定律给出：

$$
\frac{1}{n}\log P_n
=
\frac{1}{n}\sum_{i=1}^n X_i
\to
\mathbb{E}X_1
=
\mathbb{E}\log a_1
\qquad \text{a.s.}
$$

所以：

$$
P_n
\approx
\exp\left(n\,\mathbb{E}\log a_1\right).
$$

这里最值得记住的是：

$$
\mathbb{E}\log a_1
\neq
\log\mathbb{E}a_1.
$$

乘法系统看的不是平均倍率，而是平均 log-growth。一个系统可以有很大的偶发放大，但只要典型路径上的 $\mathbb{E}\log a_1<0$，长期乘积仍然会衰减。

## 3. 随机矩阵连乘

现在把标量 $a_i$ 换成矩阵：

$$
M_i\in\mathbb{R}^{d\times d}.
$$

定义随机矩阵乘积：

$$
\Pi_n
=
M_nM_{n-1}\cdots M_1.
$$

标量情形里有精确等式：

$$
\log\left(\prod_{i=1}^n a_i\right)
=
\sum_{i=1}^n\log a_i.
$$

矩阵情形通常没有对应等式：

$$
\log\|M_n\cdots M_1\|
\neq
\sum_{i=1}^n\log\|M_i\|.
$$

原因不是技术细节，而是机制本身。矩阵乘法不交换，而且每一步都会改变向量方向。某个矩阵的最大放大方向，经过前面矩阵作用后，不一定还对齐下一步矩阵的最大放大方向。

但矩阵范数满足次乘性：

$$
\|AB\|\leq \|A\|\,\|B\|.
$$

把乘积分成两段：

$$
\Pi_{n+m}
=
(M_{n+m}\cdots M_{n+1})(M_n\cdots M_1).
$$

因此：

$$
\|\Pi_{n+m}\|
\leq
\|M_{n+m}\cdots M_{n+1}\|\,
\|M_n\cdots M_1\|.
$$

取对数：

$$
\log\|\Pi_{n+m}\|
\leq
\log\|M_{n+m}\cdots M_{n+1}\|
+
\log\|M_n\cdots M_1\|.
$$

这就是次可加性。令

$$
Y_n=\log\|\Pi_n\|.
$$

在平移记号下，可以写成：

$$
Y_{n+m}
\leq
Y_n+Y_m\circ T^n.
$$

Furstenberg-Kesten 定理处理的就是这种随机矩阵乘积的长期增长率。一个常用表述是：在合适可积条件下，例如

$$
\mathbb{E}\log^+\|M_1\|<\infty,
\qquad
\log^+x=\max(\log x,0),
$$

极限

$$
\lim_{n\to\infty}
\frac{1}{n}
\log\|M_nM_{n-1}\cdots M_1\|
$$

几乎处处存在。对 i.i.d. 或更一般的遍历情形，这个极限几乎处处为常数，称为最高 Lyapunov exponent：

$$
\lambda_1
=
\lim_{n\to\infty}
\frac{1}{n}
\log\|M_nM_{n-1}\cdots M_1\|.
$$

常见形式还给出：

$$
\lambda_1
=
\inf_{n\geq 1}
\frac{1}{n}
\mathbb{E}\log\|M_nM_{n-1}\cdots M_1\|.
$$

这就是随机矩阵连乘里的平均指数增长率：

$$
\|\Pi_n\|
\approx
\exp(n\lambda_1).
$$

和标量乘积相比，$\lambda_1$ 不是单步 $\log\|M_i\|$ 的平均值。它还包含方向如何在随机矩阵之间被转动、压缩、重新对齐。

## 4. 三个增长率放在一起

三类对象可以放成一张表：

| 场景 | 对象 | 长期指数增长率 |
| --- | --- | --- |
| 固定矩阵反复乘 | $A^n$ | $\log\rho(A)$ |
| i.i.d. 标量乘积 | $\prod_{i=1}^n a_i$ | $\mathbb{E}\log a_1$ |
| i.i.d. 随机矩阵乘积 | $M_n\cdots M_1$ | $\lambda_1$ |

对应的极限是：

$$
\lim_{n\to\infty}
\frac{1}{n}\log\|A^n\|
=
\log\rho(A).
$$

$$
\lim_{n\to\infty}
\frac{1}{n}
\log\left(\prod_{i=1}^n a_i\right)
=
\mathbb{E}\log a_1.
$$

$$
\lim_{n\to\infty}
\frac{1}{n}
\log\|M_nM_{n-1}\cdots M_1\|
=
\lambda_1.
$$

从简单到复杂，就是：

$$
\text{spectral radius}
\rightarrow
\text{law of large numbers on logs}
\rightarrow
\text{Furstenberg-Kesten / Lyapunov exponent}.
$$

## 5. 放回 Transformer 梯度传播

Transformer 的反向传播可以局部写成 Jacobian 连乘。设第 $l$ 层前向映射的 Jacobian 为 $J_l$，则反向传播中会出现 $J_l^\top$。从第 $L$ 层传到第 0 层：

$$
g_0
=
J_1^\top J_2^\top\cdots J_L^\top g_L.
$$

令

$$
M_l=J_l^\top.
$$

于是：

$$
g_0
=
M_1M_2\cdots M_Lg_L.
$$

梯度范数满足：

$$
\|g_0\|
\leq
\|M_1M_2\cdots M_L\|\,
\|g_L\|.
$$

如果所有层共享同一个近似 Jacobian：

$$
M_l=M,
$$

那么：

$$
g_0=M^Lg_L,
$$

此时谱半径公式适用：

$$
\frac{1}{L}\log\|M^L\|
\to
\log\rho(M).
$$

如果每一层只是随机标量缩放：

$$
M_l=a_l I,
$$

那么：

$$
M_1M_2\cdots M_L
=
\left(\prod_{l=1}^{L}a_l\right)I,
$$

于是：

$$
\frac{1}{L}
\log\|M_1M_2\cdots M_L\|
=
\frac{1}{L}\sum_{l=1}^{L}\log|a_l|
\to
\mathbb{E}\log|a_1|.
$$

如果每一层是真正的随机矩阵，就需要随机矩阵乘积的语言：

$$
\frac{1}{L}
\log\|J_1^\top J_2^\top\cdots J_L^\top\|
\to
\lambda_1.
$$

因此，梯度稳定性可以压成一个指数率问题：

$$
\lambda_1<0
\Rightarrow
\text{梯度指数衰减};
$$

$$
\lambda_1>0
\Rightarrow
\text{梯度指数放大};
$$

$$
\lambda_1\approx 0
\Rightarrow
\text{接近临界传播}.
$$

这里的 $\lambda_1$ 更像分析语言，而不是说真实 Transformer 严格满足 i.i.d. 随机矩阵假设。真实层之间会相关，Jacobian 也随输入、训练步和参数更新而变化。但这个视角提醒我们：深层梯度传播不能只看某一层的谱范数，也不能把每层最大放大方向简单相乘。方向对齐和层间随机性同样重要。

## 6. Post-LN 与 Pre-LN 的位置

Post-LN 的反向链路中，每层都会出现外层 LayerNorm 的 Jacobian：

$$
J_l
=
J_{\operatorname{LN}}(x_l+F_l(x_l))
\left(
I+\frac{\partial F_l(x_l)}{\partial x_l}
\right).
$$

反向传播为：

$$
g_l
=
\left(
I+\frac{\partial F_l(x_l)}{\partial x_l}
\right)^\top
J_{\operatorname{LN}}(x_l+F_l(x_l))^\top
g_{l+1}.
$$

多层展开就是：

$$
g_0
=
\prod_{l=1}^{L}
\left[
\left(
I+\frac{\partial F_l(x_l)}{\partial x_l}
\right)^\top
J_{\operatorname{LN}}(x_l+F_l(x_l))^\top
\right]
g_L.
$$

这个连乘不是固定矩阵，也不是标量缩放，而是层相关、输入相关、初始化相关的随机 Jacobian 乘积。

从这个角度看，Post-LN 的问题可以这样描述：

> 靠近输出端的参数还没有经历很长的 Jacobian 连乘路径，因此初始化梯度容易偏大；靠近输入端的梯度则要穿过更多层随机 Jacobian 调制，更容易衰减。于是层间梯度尺度失衡。

这和前一篇 [Post-LN Transformer 为什么需要 Warmup？](/blog/post-ln-warmup-layernorm-gradient/) 的结论是同一件事的另一种语言。那篇文章从 LayerNorm 的 Jacobian 尺度出发，看出 Pre-LN 的 final LayerNorm 会带来约 $1/\sqrt L$ 的自然缩放，而 Post-LN 输出端没有这个深度缓冲。

warmup 处理的是更新量，而不是直接改掉 Jacobian 连乘：

$$
\Delta\theta_l
=
-\eta_t\nabla_{\theta_l}\mathcal{L}.
$$

当某些层在初始化时梯度过大，线性 warmup 使用：

$$
\eta_t
=
\frac{t}{T_{\mathrm{warmup}}}\eta_{\max}.
$$

于是：

$$
\|\Delta\theta_l\|
=
\frac{t}{T_{\mathrm{warmup}}}
\eta_{\max}
\|\nabla_{\theta_l}\mathcal{L}\|.
$$

warmup 不会把 $\lambda_{\mathrm{grad}}$ 从正改成负，也不会让随机 Jacobian 乘积突然变成临界传播。它做的是更朴素的一步：在初始化最脆弱的阶段，把输出端的大梯度更新先压住，避免参数被早期几步改得太猛。

## 7. 总结

谱半径公式告诉我们，固定矩阵反复作用的长期指数率是 $\log\rho(A)$。强大数定律告诉我们，标量随机乘积的长期指数率是 $\mathbb{E}\log a$，不是 $\log\mathbb{E}a$。Furstenberg-Kesten 定理进一步说明，随机矩阵乘积也有长期指数率，也就是最高 Lyapunov exponent。

放回 Transformer，这条线可以写成：

$$
\boxed{
\text{gradient propagation}
=
\text{random Jacobian product}
\quad\Rightarrow\quad
\text{exponential rate problem}
}
$$

因此，分析深层梯度时，谱半径只是起点。真正接近 Transformer 的问题是：每层 Jacobian 如何缩放、如何转动方向、如何在随机连乘中形成长期指数率，以及这个指数率在不同层的截断路径上如何表现为梯度尺度失衡。

## 参考资料

- Joel A. Tropp, [An Elementary Proof of the Spectral Radius Formula for Matrices](https://www.ma.imperial.ac.uk/~ajacquie/IC_Num_Methods/IC_Num_Methods_Docs/Literature/Tropp_SpectralRadius.pdf).
- H. Furstenberg and H. Kesten, [Products of Random Matrices](https://doi.org/10.1214/aoms/1177705909), The Annals of Mathematical Statistics, 1960.
- Henning Rutar, [Random Matrix Products](https://rutar.org/notes/random_matrix_products.pdf).
- J. F. C. Kingman, [The Ergodic Theory of Subadditive Stochastic Processes](https://www.jstor.org/stable/2959392), Journal of the Royal Statistical Society, Series B, 1973.
