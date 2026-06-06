---
title: '形式化建模：SFT 是外部数据分布上的前向 KL 投影'
description: '把自回归语言模型写成有限时域决策过程，并推导 SFT 目标在外部数据分布上的前向 KL 分解、最优解和 logits 梯度。'
publishDate: '2026-06-06'
tags: ['SFT', 'KL', '强化学习', 'LLM', '形式化建模', '策略梯度']
language: 'zh-CN'
draft: false
---

# 形式化建模：SFT 是外部数据分布上的前向 KL 投影

## 2. 形式化建模

### 2.1 把自回归语言模型写成有限时域决策过程

**定义 2.1（提示、动作、状态）.** 设 $\mathcal X$ 为 prompt 集合，$\mathcal A$ 为 token 动作集合，包含特殊终止符 EOS。设最大生成步数为 $H\in\mathbb N$。

在第 $t$ 步，状态记为

$$
s_t=(x,a_{<t})=(x,a_1,\ldots,a_{t-1}),
$$

其中 $x\in\mathcal X$，$a_i\in\mathcal A$。因此状态就是“prompt + 当前前缀”。

**注记 2.2.** 为了避免可变长序列引入不必要的技术细节，本文采用“最大长度 $H$，遇到 EOS 后进入吸收终止态”的标准处理。这样可以把每条轨迹都看成长度恰为 $H$ 的序列，而不影响终止前的自回归部分。

**定义 2.3（策略）.** 一个语言模型策略 $\pi$ 是从状态到动作分布的映射：

$$
\pi(\cdot\mid s)\in\Delta(\mathcal A),\qquad s\in\mathcal S.
$$

其中 $\Delta(\mathcal A)$ 表示动作单纯形。若用 logits $z_\pi(s,a)$ 参数化，则

$$
\pi(a\mid s)
=
\frac{\exp(z_\pi(s,a))}
{\sum_{b\in\mathcal A}\exp(z_\pi(s,b))}.
$$

**定义 2.4（轨迹分布）.** 设 prompt 分布为 $\rho(x)$。给定策略 $\pi$，一条轨迹记为

$$
\tau=(x,a_1,\ldots,a_H).
$$

其条件概率为

$$
P_\pi(\tau)
=
\rho(x)
\prod_{t=1}^{H}
\pi(a_t\mid s_t),
\qquad
s_t=(x,a_{<t}).
$$

**定义 2.5（状态-动作边缘、占用测度）.** 定义策略 $\pi$ 的状态-动作边缘为

$$
q_\pi(s,a)
:=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s,\ a_t=a\}.
$$

定义对应的状态占用测度

$$
d_\pi(s)
:=
\sum_{a\in\mathcal A}q_\pi(s,a)
=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s\}.
$$

定义归一化占用分布

$$
\bar d_\pi(s)
:=
\frac{1}{H}d_\pi(s)
=
\frac{1}{H}
\sum_{t=1}^{H}
\Pr_\pi(s_t=s).
$$

**注记 2.6.** $d_\pi$ 不是概率分布，它的总质量是 $H$；$\bar d_\pi$ 才是概率分布。本文凡是讨论总变差（TV）或分布失配时，都优先使用 $\bar d_\pi$。

**引理 2.7（对轨迹求和与对占用测度求和是等价的）.** 对任意函数 $f:\mathcal S\times\mathcal A\to\mathbb R$，

$$
\mathbb E_{\tau\sim P_\pi}
\left[
\sum_{t=1}^{H}
f(s_t,a_t)
\right]
=
\sum_{s\in\mathcal S}
\sum_{a\in\mathcal A}
q_\pi(s,a)f(s,a).
$$

若 $g:\mathcal S\to\mathbb R$ 只依赖状态，则

$$
\mathbb E_{\tau\sim P_\pi}
\left[
\sum_{t=1}^{H}
g(s_t)
\right]
=
\sum_{s\in\mathcal S}
d_\pi(s)g(s).
$$

**证明.** 直接展开：

$$
\begin{aligned}
\mathbb E_{\tau\sim P_\pi}
\left[
\sum_{t=1}^{H}
f(s_t,a_t)
\right]
&=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
f(s_t,a_t)
\\
&=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\sum_{s,a}
\mathbf 1\{s_t=s,\ a_t=a\}f(s,a)
\\
&=
\sum_{s,a}
\left(
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s,\ a_t=a\}
\right)
f(s,a)
\\
&=
\sum_{s,a}
q_\pi(s,a)f(s,a).
\end{aligned}
$$

第二式令 $f(s,a)=g(s)$ 即得。

### 2.2 外部数据分布与经验数据策略

**定义 2.8（数据轨迹分布）.** 设 $Q$ 是一个外部数据分布，例如人工标注答案、teacher 生成答案、混合示范集等。它给出轨迹 $\tau=(x,a_1,\ldots,a_H)$ 的概率 $Q(\tau)$。

与策略分布完全同理，定义数据的状态-动作边缘

$$
q_Q(s,a)
:=
\sum_\tau
Q(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s,\ a_t=a\},
\qquad
d_Q(s)
:=
\sum_a
q_Q(s,a),
$$

$$
\bar d_Q(s)
:=
\frac{1}{H}
d_Q(s).
$$

**定义 2.9（经验数据策略）.** 对所有满足 $d_Q(s)>0$ 的状态，定义经验数据策略

$$
\mu_Q(a\mid s)
:=
\frac{q_Q(s,a)}
{d_Q(s)}.
$$

若 $d_Q(s)=0$，则 $\mu_Q(\cdot\mid s)$ 可任意指定，因为该状态在所有相关目标中权重为 $0$。

**注记 2.10.** 当每个 $(s)$ 只出现一个标注 token 时，$\mu_Q(\cdot\mid s)$ 就是 one-hot 分布；当有多参考答案、软标签、或 teacher logits 时，$\mu_Q(\cdot\mid s)$ 就是一般分布。因此“硬标签 SFT”和“软标签蒸馏”在数学上只差一个 target 分布是否为 one-hot。

**性质 2.13（占用测度的总质量）.** 对任意策略分布 $P_\pi$，有

$$
\sum_{s\in\mathcal S}
d_\pi(s)
=
H,
\qquad
\sum_{s\in\mathcal S}
\bar d_\pi(s)
=
1,
$$

以及

$$
\sum_{s\in\mathcal S}
\sum_{a\in\mathcal A}
q_\pi(s,a)
=
H.
$$

同理，对数据分布 $Q$ 也有

$$
\sum_s d_Q(s)=H,
\qquad
\sum_s \bar d_Q(s)=1,
\qquad
\sum_{s,a}q_Q(s,a)=H.
$$

**证明.** 以 $d_\pi$ 为例：

$$
\begin{aligned}
\sum_s d_\pi(s)
&=
\sum_s
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s\}
\\
&=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
\sum_s
\mathbf 1\{s_t=s\}
\\
&=
\sum_\tau
P_\pi(\tau)
\sum_{t=1}^{H}
1
=
H.
\end{aligned}
$$

其他式子同理。

**性质 2.14（状态边缘与经验策略的条件分解）.** 对所有 $d_Q(s)>0$ 的状态，有

$$
q_Q(s,a)
=
d_Q(s)\mu_Q(a\mid s).
$$

因此数据轨迹上的 token 级期望可以写成

$$
\sum_{s,a}
q_Q(s,a)f(s,a)
=
\sum_s
d_Q(s)
\sum_a
\mu_Q(a\mid s)f(s,a).
$$

**证明.** 第一式由 $\mu_Q(a\mid s)=q_Q(s,a)/d_Q(s)$ 直接得到；第二式代入第一式即可。

### 2.3 本文用到的散度与算子

**定义 2.11（交叉熵、前向 KL、反向 KL、总变差）.** 对定义在 $\mathcal A$ 上的两个分布 $p,q$：

交叉熵定义为

$$
H(p,q)
:=
-
\sum_{a\in\mathcal A}
p(a)\log q(a).
$$

前向 KL 定义为

$$
D_{\mathrm{KL}}(p\Vert q)
:=
\sum_{a\in\mathcal A}
p(a)\log\frac{p(a)}{q(a)}.
$$

反向 KL 在符号上就是交换顺序：

$$
D_{\mathrm{KL}}(q\Vert p)
:=
\sum_{a\in\mathcal A}
q(a)\log\frac{q(a)}{p(a)}.
$$

总变差定义为

$$
\mathrm{TV}(p,q)
:=
\frac{1}{2}
\sum_{a\in\mathcal A}
|p(a)-q(a)|.
$$

**注记 2.12.** 注意：工程里常说“forward KL / reverse KL”，本质上只是两个参数顺序不同；本文会明确写成 $D_{\mathrm{KL}}(p\Vert q)$ 或 $D_{\mathrm{KL}}(q\Vert p)$，避免口头混淆。

## 3. SFT：外部数据分布上的前向 KL 投影

### 3.1 目标函数展开

**定义 3.1（SFT 目标）.** 给定外部数据分布 $Q$，SFT 目标写成

$$
L_{\mathrm{SFT}}(\pi)
:=
\mathbb E_{\tau\sim Q}
\left[
-
\sum_{t=1}^{H}
\log \pi(a_t\mid s_t)
\right].
$$

**定理 3.2（SFT 的精确分解）.** SFT 目标可以精确写成

$$
L_{\mathrm{SFT}}(\pi)
=
\sum_{s\in\mathcal S}
d_Q(s)
H\left(
\mu_Q(\cdot\mid s),
\pi(\cdot\mid s)
\right),
$$

以及

$$
L_{\mathrm{SFT}}(\pi)
=
C_Q
+
\sum_{s\in\mathcal S}
d_Q(s)
D_{\mathrm{KL}}
\left(
\mu_Q(\cdot\mid s)
\Vert
\pi(\cdot\mid s)
\right),
$$

其中常数项

$$
C_Q
:=
\sum_{s\in\mathcal S}
d_Q(s)
H\left(
\mu_Q(\cdot\mid s)
\right)
$$

与 $\pi$ 无关。

**证明.** 逐步展开：

$$
\begin{aligned}
L_{\mathrm{SFT}}(\pi)
&=
\mathbb E_{\tau\sim Q}
\left[
-
\sum_{t=1}^{H}
\log \pi(a_t\mid s_t)
\right]
\\
&=
-
\sum_\tau
Q(\tau)
\sum_{t=1}^{H}
\log \pi(a_t\mid s_t)
\\
&=
-
\sum_\tau
Q(\tau)
\sum_{t=1}^{H}
\sum_{s,a}
\mathbf 1\{s_t=s,\ a_t=a\}
\log \pi(a\mid s)
\\
&=
-
\sum_{s,a}
\left(
\sum_\tau
Q(\tau)
\sum_{t=1}^{H}
\mathbf 1\{s_t=s,\ a_t=a\}
\right)
\log \pi(a\mid s)
\\
&=
-
\sum_{s,a}
q_Q(s,a)\log \pi(a\mid s).
\end{aligned}
$$

利用 $q_Q(s,a)=d_Q(s)\mu_Q(a\mid s)$，

$$
\begin{aligned}
L_{\mathrm{SFT}}(\pi)
&=
-
\sum_s
d_Q(s)
\sum_a
\mu_Q(a\mid s)\log \pi(a\mid s)
\\
&=
\sum_s
d_Q(s)
H(\mu_Q,\pi).
\end{aligned}
$$

再利用恒等式

$$
H(\mu_Q,\pi)
=
H(\mu_Q)
+
D_{\mathrm{KL}}(\mu_Q\Vert\pi),
$$

得到

$$
L_{\mathrm{SFT}}(\pi)
=
\sum_s
d_Q(s)
H(\mu_Q(\cdot\mid s))
+
\sum_s
d_Q(s)
D_{\mathrm{KL}}
\left(
\mu_Q(\cdot\mid s)
\Vert
\pi(\cdot\mid s)
\right).
$$

第一项与 $\pi$ 无关，即为常数 $C_Q$。

**推论 3.3（SFT 是对经验数据策略的 off-policy distillation）.** 若把 $\mu_Q(\cdot\mid s)$ 看成“经验 teacher”，则 SFT 正是在外部状态分布 $d_Q$ 上，对 teacher 条件分布做前向 KL 投影。

**证明.** 由定理 3.2，优化 $L_{\mathrm{SFT}}$ 等价于最小化

$$
\sum_s
d_Q(s)
D_{\mathrm{KL}}
\left(
\mu_Q(\cdot\mid s)
\Vert
\pi(\cdot\mid s)
\right).
$$

这正是前向 KL distillation，只不过 teacher 不是一个显式模型，而是数据经验分布 $\mu_Q$。

### 3.2 SFT 最优解与其“只约束数据支持集”的性质

**定理 3.4（SFT 的非参数最优解）.** 若把优化域看成所有随机策略的集合，则

$$
\arg\min_\pi L_{\mathrm{SFT}}(\pi)
=
\left\{
\pi:
\pi(\cdot\mid s)=\mu_Q(\cdot\mid s)
\quad
\forall s\ \mathrm{with}\ d_Q(s)>0
\right\}.
$$

在所有 $d_Q(s)=0$ 的状态上，SFT 目标没有任何约束。

**证明.** 由定理 3.2，

$$
L_{\mathrm{SFT}}(\pi)
=
C_Q
+
\sum_s
d_Q(s)
D_{\mathrm{KL}}(\mu_Q\Vert\pi).
$$

每一项 KL 非负，且当且仅当 $\pi(\cdot\mid s)=\mu_Q(\cdot\mid s)$ 时取 $0$。对 $d_Q(s)=0$ 的状态，对应项恒为 $0$，所以不约束这些状态。

**命题 3.5（SFT 在数据支持集外完全不敏感）.** 若两个策略 $\pi,\tilde\pi$ 满足

$$
\pi(\cdot\mid s)
=
\tilde\pi(\cdot\mid s)
\qquad
\forall s\in\operatorname{supp}(d_Q),
$$

则

$$
L_{\mathrm{SFT}}(\pi)
=
L_{\mathrm{SFT}}(\tilde\pi).
$$

**证明.** 由定理 3.2，SFT 目标只对所有满足 $d_Q(s)>0$ 的状态求和；在其余状态上的策略如何变化都不会进入目标函数。

**注记 3.6.** 这条命题几乎就是“灾难性遗忘为何可能发生”的最直接数学表述：如果旧能力对应的 states 不在当前 SFT 数据支持集里，SFT 目标对这些旧 states 没有任何显式约束。

**性质 3.A（one-hot 标签是 SFT 的特例）.** 若某个数据状态 $s$ 上只有一个标注 token $a^\star$，即

$$
\mu_Q(a^\star\mid s)=1,
\qquad
\mu_Q(a\mid s)=0\quad(a\neq a^\star),
$$

则局部交叉熵退化为普通 hard-label 负对数似然：

$$
H(\mu_Q,\pi)
=
-
\log\pi(a^\star\mid s).
$$

对应的 logit 梯度为

$$
\frac{\partial \ell_{\mathrm{SFT}}(s)}
{\partial z(s,a)}
=
\pi(a\mid s)
-
\mathbf 1\{a=a^\star\}.
$$

因此 hard-label SFT 不是另一个目标，而是 $\mu_Q$ 为 one-hot 时的特例。

**性质 3.B（前向 KL 对数据动作的零概率敏感）.** 对任意满足 $d_Q(s)>0$ 的状态，如果存在动作 $a$ 使得

$$
\mu_Q(a\mid s)>0,
\qquad
\pi(a\mid s)=0,
$$

则

$$
D_{\mathrm{KL}}
\left(
\mu_Q(\cdot\mid s)
\Vert
\pi(\cdot\mid s)
\right)
=
+\infty.
$$

这说明前向 KL 会强烈惩罚“数据里出现过的动作被模型分配零概率”。在有限 logits 的 softmax 参数化下，$\pi(a\mid s)$ 不会真的等于 $0$，但当它趋近于 $0$ 时，该项会迅速变大。

**性质 3.C（SFT 不直接约束 rollout 状态分布失配）.** 设 $h:\mathcal S\to\mathbb R$ 是任意有界状态函数，且 $|h(s)|\le M$。则

$$
\left|
\sum_s
\bar d_\pi(s)h(s)
-
\sum_s
\bar d_Q(s)h(s)
\right|
\le
2M\,
\mathrm{TV}(\bar d_\pi,\bar d_Q).
$$

SFT 目标直接优化的是外部状态权重 $d_Q(s)$ 下的条件分布匹配，而不是 $\bar d_\pi$ 与 $\bar d_Q$ 的接近程度。因此，当训练数据状态分布和模型 rollout 状态分布相差很大时，即使数据支持集上的 token loss 很低，模型在自己生成出来的新前缀上仍然可能缺少约束。

**证明.** 由总变差定义，

$$
\begin{aligned}
\left|
\sum_s
(\bar d_\pi(s)-\bar d_Q(s))h(s)
\right|
&\le
\sum_s
|\bar d_\pi(s)-\bar d_Q(s)|\,|h(s)|
\\
&\le
M
\sum_s
|\bar d_\pi(s)-\bar d_Q(s)|
\\
&=
2M\,
\mathrm{TV}(\bar d_\pi,\bar d_Q).
\end{aligned}
$$

### 3.3 SFT 梯度的完整展开

固定某个状态 $s$，记

$$
p_i
:=
\pi(a_i\mid s),
\qquad
q_i
:=
\mu_Q(a_i\mid s),
\qquad
p_i
=
\frac{e^{z_i}}
{\sum_j e^{z_j}}.
$$

对应的局部 SFT 损失为

$$
\ell_{\mathrm{SFT}}(s)
=
-
\sum_i
q_i\log p_i.
$$

**引理 3.7（softmax 雅可比）.** 对 softmax 输出 $p_i=\frac{e^{z_i}}{\sum_j e^{z_j}}$，有

$$
\frac{\partial p_i}
{\partial z_k}
=
p_i(\delta_{ik}-p_k),
$$

其中 $\delta_{ik}$ 是 Kronecker delta。

**证明.** 记 $Z=\sum_j e^{z_j}$，则 $p_i=e^{z_i}/Z$。对 $z_k$ 求导：

$$
\begin{aligned}
\frac{\partial p_i}
{\partial z_k}
&=
\frac{
\delta_{ik}e^{z_i}Z
-
e^{z_i}e^{z_k}
}
{Z^2}
\\
&=
\frac{e^{z_i}}{Z}
\left(
\delta_{ik}
-
\frac{e^{z_k}}{Z}
\right)
\\
&=
p_i(\delta_{ik}-p_k).
\end{aligned}
$$

**定理 3.8（SFT 对 logits 的梯度）.** 对固定状态 $s$，局部损失 $\ell_{\mathrm{SFT}}(s)$ 关于 logit $z_k$ 的梯度为

$$
\frac{\partial \ell_{\mathrm{SFT}}(s)}
{\partial z_k}
=
p_k-q_k.
$$

因此全局损失满足

$$
\frac{\partial L_{\mathrm{SFT}}}
{\partial z(s,a_k)}
=
d_Q(s)
\left(
\pi(a_k\mid s)
-
\mu_Q(a_k\mid s)
\right).
$$

**证明.** 直接对

$$
\ell_{\mathrm{SFT}}(s)
=
-
\sum_i
q_i\log p_i
$$

求导：

$$
\begin{aligned}
\frac{\partial \ell_{\mathrm{SFT}}(s)}
{\partial z_k}
&=
-
\sum_i
q_i
\frac{1}{p_i}
\frac{\partial p_i}
{\partial z_k}
\\
&=
-
\sum_i
q_i
\frac{1}{p_i}
p_i(\delta_{ik}-p_k)
\\
&=
-
\sum_i
q_i\delta_{ik}
+
\sum_i
q_ip_k
\\
&=
-
q_k
+
p_k
\sum_i
q_i
\\
&=
p_k-q_k,
\end{aligned}
$$

因为 $\sum_i q_i=1$。再乘上全局权重 $d_Q(s)$ 即得。

**注记 3.9.** 这条公式说明 SFT 的更新方向完全由数据状态权重 $d_Q(s)$ 决定。出现次数高的状态梯度大，没出现的状态梯度严格为零。

**性质 3.D（logits 梯度在每个状态内质量守恒）.** 对固定状态 $s$，局部梯度满足

$$
\sum_k
\frac{\partial \ell_{\mathrm{SFT}}(s)}
{\partial z_k}
=
0.
$$

**证明.** 由定理 3.8，

$$
\sum_k(p_k-q_k)
=
\sum_k p_k
-
\sum_k q_k
=
1-1
=
0.
$$

这也对应 softmax 的平移不变性：给同一个状态下所有 logits 同时加上常数，不会改变策略分布。

**性质 3.E（数据频次只改变梯度权重，不改变局部方向）.** 若两个状态 $s_1,s_2$ 的局部分布差相同，即

$$
\pi(\cdot\mid s_1)-\mu_Q(\cdot\mid s_1)
=
\pi(\cdot\mid s_2)-\mu_Q(\cdot\mid s_2),
$$

则它们在全局 SFT 梯度中的比例只由 $d_Q$ 决定：

$$
\frac{
\partial L_{\mathrm{SFT}}/\partial z(s_1,a)
}{
\partial L_{\mathrm{SFT}}/\partial z(s_2,a)
}
=
\frac{d_Q(s_1)}{d_Q(s_2)}
$$

在分母非零时成立。因此，SFT 的“更重视哪些状态”完全来自数据占用频次或采样权重。

## 附录 A：几个最小代码验证

### A.1 验证 SFT 分解与 logits 梯度

下面这个 PyTorch 例子同时验证两件事：

1. SFT soft-label 交叉熵等于常数熵项加前向 KL。
2. logits 梯度等于 $d_Q(s)(\pi-\mu_Q)$。

```python
import torch

torch.manual_seed(0)

num_states = 3
num_actions = 5

logits = torch.randn(num_states, num_actions, requires_grad=True)
mu_q = torch.softmax(torch.randn(num_states, num_actions), dim=-1)
d_q = torch.tensor([4.0, 2.0, 0.0])

pi = torch.softmax(logits, dim=-1)

cross_entropy = -(mu_q * torch.log(pi)).sum(dim=-1)
loss = (d_q * cross_entropy).sum()

entropy = -(mu_q * torch.log(mu_q)).sum(dim=-1)
forward_kl = (mu_q * (torch.log(mu_q) - torch.log(pi))).sum(dim=-1)
decomposed = (d_q * (entropy + forward_kl)).sum()

print(torch.allclose(loss, decomposed, atol=1e-6))

loss.backward()
expected_grad = d_q[:, None] * (pi.detach() - mu_q)

print(torch.allclose(logits.grad, expected_grad, atol=1e-6))
print(logits.grad)
```

其中 `d_q[2] = 0`，所以第三个状态即使有 logits，也不会产生梯度。

### A.2 hard-label SFT 是 one-hot soft-label 的特例

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)

batch = 4
vocab = 6

logits = torch.randn(batch, vocab)
targets = torch.tensor([2, 3, 3, 0])

hard_label_loss = F.cross_entropy(logits, targets, reduction="none")

one_hot_targets = F.one_hot(targets, num_classes=vocab).float()
soft_label_loss = -(one_hot_targets * F.log_softmax(logits, dim=-1)).sum(dim=-1)

print(hard_label_loss)
print(soft_label_loss)
print(torch.allclose(hard_label_loss, soft_label_loss, atol=1e-6))
```

这段代码对应性质 3.A：普通 token-level cross entropy 只是 $\mu_Q$ 取 one-hot 时的特殊情形。

### A.3 从轨迹样本统计 $q_Q,d_Q,\mu_Q$

下面的例子把若干条固定长度轨迹统计成状态-动作边缘和经验数据策略。

```python
from collections import Counter, defaultdict

trajectories = [
    ("x1", ("A", "B", "EOS")),
    ("x1", ("A", "C", "EOS")),
    ("x2", ("D", "EOS", "EOS")),
]

q_q = Counter()
d_q = Counter()

for prompt, actions in trajectories:
    prefix = ()
    for action in actions:
        state = (prompt, prefix)
        q_q[(state, action)] += 1
        d_q[state] += 1
        prefix = prefix + (action,)

mu_q = defaultdict(dict)
for (state, action), count in q_q.items():
    mu_q[state][action] = count / d_q[state]

print("d_Q:")
for state, count in d_q.items():
    print(state, count)

print("\nmu_Q:")
for state, dist in mu_q.items():
    print(state, dist)
```

输出里，状态 `("x1", ("A",))` 会同时看到动作 `"B"` 和 `"C"`，因此它的 $\mu_Q(\cdot\mid s)$ 不是 one-hot，而是一个经验条件分布。
