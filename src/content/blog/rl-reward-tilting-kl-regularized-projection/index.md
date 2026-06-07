---
title: '形式化建模：RL 是当前策略分布上的 reward-tilting 与 KL 正则投影'
description: '从策略梯度、轨迹级 KL 正则化和状态级局部策略改进入手，推导 RL 中 reward-tilted Gibbs 分布与 Boltzmann teacher。'
publishDate: '2026-06-07'
tags: ['RL', 'KL', '强化学习', 'LLM', '策略梯度', 'PPO', 'GRPO']
language: 'zh-CN'
draft: false
---

# 形式化建模：RL 是当前策略分布上的 reward-tilting 与 KL 正则投影

本文沿用前文的有限时域自回归建模记号：状态 $s=(x,a_{<t})$ 表示“prompt + 当前前缀”，动作 $a$ 表示 token，$d_\pi(s)$ 表示策略 $\pi$ 的状态占用测度。这里重点讨论 RL 目标在这些记号下到底约束了什么分布。

## 4. RL：当前策略分布上的 reward-tilting 与 KL 正则投影

RL 的形式很多。为了得到可严格证明的分布关系，本文采用两种互补的表述：

1. 轨迹层面的 KL 正则化 reward 最大化；
2. 状态层面的 KL 正则化局部策略改进。

这两种写法都能得到精确的“reward-tilted target distribution”结论。PPO、GRPO 等工程算法可视为对这类局部 / 全局正则目标的数值近似，而不是完全不同的数学对象。

### 4.1 策略梯度恒等式的逐步推导

先回顾最基础的策略梯度。设轨迹总 reward 为

$$
R(\tau)
=
\sum_{t=1}^{H}
r(s_t,a_t).
$$

定义目标

$$
J(\theta)
:=
\mathbb E_{\tau\sim P_{\pi_\theta}}
[R(\tau)].
$$

**定理 4.1（策略梯度公式）.** 有

$$
\nabla_\theta J(\theta)
=
\mathbb E_{\tau\sim P_{\pi_\theta}}
\left[
R(\tau)
\sum_{t=1}^{H}
\nabla_\theta
\log \pi_\theta(a_t\mid s_t)
\right].
$$

进一步，若 $Q^{\pi_\theta}(s,a)$ 表示在状态 $s$ 采取动作 $a$ 的回报期望，则

$$
\nabla_\theta J(\theta)
=
\sum_s
d_{\pi_\theta}(s)
\sum_a
\pi_\theta(a\mid s)
Q^{\pi_\theta}(s,a)
\nabla_\theta
\log \pi_\theta(a\mid s).
$$

若再减去任意 baseline $b(s)$，则

$$
\nabla_\theta J(\theta)
=
\sum_s
d_{\pi_\theta}(s)
\sum_a
\pi_\theta(a\mid s)
A^{\pi_\theta}(s,a)
\nabla_\theta
\log \pi_\theta(a\mid s),
$$

其中

$$
A^{\pi_\theta}(s,a)
=
Q^{\pi_\theta}(s,a)-b(s).
$$

**证明.** 第一步，用 score-function trick：

$$
\begin{aligned}
\nabla_\theta J(\theta)
&=
\nabla_\theta
\sum_\tau
P_{\pi_\theta}(\tau)R(\tau)
\\
&=
\sum_\tau
\nabla_\theta P_{\pi_\theta}(\tau)R(\tau)
\\
&=
\sum_\tau
P_{\pi_\theta}(\tau)
\nabla_\theta
\log P_{\pi_\theta}(\tau)
R(\tau).
\end{aligned}
$$

而

$$
P_{\pi_\theta}(\tau)
=
\rho(x)
\prod_{t=1}^{H}
\pi_\theta(a_t\mid s_t),
$$

于是

$$
\log P_{\pi_\theta}(\tau)
=
\log \rho(x)
+
\sum_{t=1}^{H}
\log \pi_\theta(a_t\mid s_t).
$$

因为 $\rho$ 不依赖 $\theta$，

$$
\nabla_\theta
\log P_{\pi_\theta}(\tau)
=
\sum_{t=1}^{H}
\nabla_\theta
\log \pi_\theta(a_t\mid s_t).
$$

代回即得

$$
\nabla_\theta J(\theta)
=
\mathbb E_{\tau\sim P_{\pi_\theta}}
\left[
R(\tau)
\sum_{t=1}^{H}
\nabla_\theta
\log \pi_\theta(a_t\mid s_t)
\right].
$$

第二步，把 $R(\tau)$ 替换为从当前步往后的 return $G_t$，得到

$$
\nabla_\theta J(\theta)
=
\mathbb E
\left[
\sum_{t=1}^{H}
G_t
\nabla_\theta
\log \pi_\theta(a_t\mid s_t)
\right].
$$

对 $(s_t,a_t)$ 条件化：

$$
\begin{aligned}
\nabla_\theta J(\theta)
&=
\sum_{t=1}^{H}
\sum_{s,a}
\Pr_{\pi_\theta}(s_t=s,a_t=a)
\mathbb E[G_t\mid s_t=s,a_t=a]
\nabla_\theta
\log \pi_\theta(a\mid s)
\\
&=
\sum_{t=1}^{H}
\sum_{s,a}
\Pr_{\pi_\theta}(s_t=s)
\pi_\theta(a\mid s)
Q^{\pi_\theta}(s,a)
\nabla_\theta
\log \pi_\theta(a\mid s).
\end{aligned}
$$

对 $t$ 求和即得

$$
\nabla_\theta J(\theta)
=
\sum_s
d_{\pi_\theta}(s)
\sum_a
\pi_\theta(a\mid s)
Q^{\pi_\theta}(s,a)
\nabla_\theta
\log \pi_\theta(a\mid s).
$$

第三步，说明 baseline 不改变梯度：

$$
\begin{aligned}
\sum_a
\pi_\theta(a\mid s)b(s)
\nabla_\theta
\log \pi_\theta(a\mid s)
&=
b(s)
\sum_a
\pi_\theta(a\mid s)
\frac{\nabla_\theta\pi_\theta(a\mid s)}
{\pi_\theta(a\mid s)}
\\
&=
b(s)
\sum_a
\nabla_\theta\pi_\theta(a\mid s)
\\
&=
b(s)
\nabla_\theta
\sum_a
\pi_\theta(a\mid s)
\\
&=
b(s)\nabla_\theta 1
=
0.
\end{aligned}
$$

因此可以把 $Q^{\pi_\theta}(s,a)$ 替换为 $A^{\pi_\theta}(s,a)=Q^{\pi_\theta}(s,a)-b(s)$。

**注记 4.2.** 这里最重要的一点不是公式本身，而是梯度中的状态权重是 $d_{\pi_\theta}$，也就是当前策略真正访问到的状态分布。这正是 RL 的 on-policy 性质。

### 4.2 轨迹层面的 KL 正则化 RL：reward-tilted Gibbs 分布

**定义 4.3（参考条件轨迹分布）.** 给定参考策略 $\pi_{\mathrm{ref}}$，定义在每个 prompt $x$ 下的参考条件轨迹分布

$$
P_{\mathrm{ref}}(y\mid x)
=
\prod_{t=1}^{H}
\pi_{\mathrm{ref}}(a_t\mid s_t),
$$

其中 $y=(a_1,\ldots,a_H)$。

**定义 4.4（轨迹层面的 KL 正则化 RL 目标）.** 设 $R(x,y)$ 是每个 prompt 和完整回答的序列级 reward，$\beta>0$ 为正则强度。定义

$$
J_{\mathrm{traj}}(P)
:=
\sum_{x\in\mathcal X}
\rho(x)
\sum_{y\in\mathcal Y}
P(y\mid x)R(x,y)
-
\beta
\sum_{x\in\mathcal X}
\rho(x)
D_{\mathrm{KL}}
\left(
P(\cdot\mid x)
\Vert
P_{\mathrm{ref}}(\cdot\mid x)
\right),
$$

其中优化变量是条件分布 $P(\cdot\mid x)\in\Delta(\mathcal Y)$。

**定理 4.5（轨迹层面的 Gibbs 最优解）.** 对每个 prompt $x$，最优条件分布为

$$
P^\star(y\mid x)
=
\frac{
P_{\mathrm{ref}}(y\mid x)
\exp(R(x,y)/\beta)
}
{Z_\beta(x)},
$$

其中

$$
Z_\beta(x)
:=
\sum_{y'}
P_{\mathrm{ref}}(y'\mid x)
\exp(R(x,y')/\beta).
$$

并且有精确恒等式

$$
J_{\mathrm{traj}}(P)
=
\beta
\sum_x
\rho(x)\log Z_\beta(x)
-
\beta
\sum_x
\rho(x)
D_{\mathrm{KL}}
\left(
P(\cdot\mid x)
\Vert
P^\star(\cdot\mid x)
\right).
$$

**证明.** 对每个固定的 $x$，问题可分解为

$$
\max_{P(\cdot\mid x)\in\Delta(\mathcal Y)}
\left\{
\sum_y
P(y\mid x)R(x,y)
-
\beta
\sum_y
P(y\mid x)
\log
\frac{P(y\mid x)}
{P_{\mathrm{ref}}(y\mid x)}
\right\}.
$$

加入归一化约束 $\sum_y P(y\mid x)=1$ 的 Lagrange 乘子 $\lambda_x$：

$$
\mathcal L_x
=
\sum_y
P(y\mid x)R(x,y)
-
\beta
\sum_y
P(y\mid x)
\log
\frac{P(y\mid x)}
{P_{\mathrm{ref}}(y\mid x)}
+
\lambda_x
\left(
\sum_y
P(y\mid x)
-
1
\right).
$$

对每个 $y$ 求偏导并令其为零：

$$
0
=
\frac{\partial\mathcal L_x}
{\partial P(y\mid x)}
=
R(x,y)
-
\beta
\left(
\log
\frac{P(y\mid x)}
{P_{\mathrm{ref}}(y\mid x)}
+
1
\right)
+
\lambda_x.
$$

整理得

$$
\log
\frac{P(y\mid x)}
{P_{\mathrm{ref}}(y\mid x)}
=
\frac{R(x,y)+\lambda_x-\beta}
{\beta}.
$$

指数化后

$$
P(y\mid x)
=
P_{\mathrm{ref}}(y\mid x)
\exp
\left(
\frac{R(x,y)}{\beta}
\right)
\cdot
\exp
\left(
\frac{\lambda_x-\beta}{\beta}
\right).
$$

后面的项与 $y$ 无关，因此是归一化常数，记为 $1/Z_\beta(x)$，得到

$$
P^\star(y\mid x)
=
\frac{
P_{\mathrm{ref}}(y\mid x)e^{R(x,y)/\beta}
}
{Z_\beta(x)}.
$$

下面证明第二个恒等式。由 $P^\star$ 的定义，

$$
\log P^\star(y\mid x)
=
\log P_{\mathrm{ref}}(y\mid x)
+
\frac{R(x,y)}{\beta}
-
\log Z_\beta(x).
$$

因此

$$
\begin{aligned}
D_{\mathrm{KL}}(P(\cdot\mid x)\Vert P^\star(\cdot\mid x))
&=
\sum_y
P(y\mid x)
\log
\frac{P(y\mid x)}
{P^\star(y\mid x)}
\\
&=
\sum_y
P(y\mid x)
\left[
\log P(y\mid x)
-
\log P_{\mathrm{ref}}(y\mid x)
-
\frac{R(x,y)}{\beta}
+
\log Z_\beta(x)
\right]
\\
&=
D_{\mathrm{KL}}(P(\cdot\mid x)\Vert P_{\mathrm{ref}}(\cdot\mid x))
-
\frac{1}{\beta}
\sum_y
P(y\mid x)R(x,y)
+
\log Z_\beta(x).
\end{aligned}
$$

移项后得到

$$
\sum_y
P(y\mid x)R(x,y)
-
\beta
D_{\mathrm{KL}}(P(\cdot\mid x)\Vert P_{\mathrm{ref}}(\cdot\mid x))
=
\beta\log Z_\beta(x)
-
\beta
D_{\mathrm{KL}}(P(\cdot\mid x)\Vert P^\star(\cdot\mid x)).
$$

最后乘上 $\rho(x)$ 并对 $x$ 求和即得结论。

**推论 4.6（RL 在轨迹层面是对 reward-tilted target 的反向 KL 投影）.** 定理 4.5 说明：带 KL 正则的轨迹级 RL，不是“凭空把概率推到高 reward”，而是把参考轨迹分布 $P_{\mathrm{ref}}$ 经过 $e^{R/\beta}$ 做 Gibbs 变换，再对这个新分布做反向 KL 投影。

### 4.3 状态层面的 KL 正则局部策略改进：Boltzmann teacher

轨迹公式很干净，但工程里更常见的是当前策略 $\pi_k$ 的局部改进步。这时我们用 advantage 写局部目标。

**定义 4.7（KL 正则的局部策略改进目标）.** 给定当前策略 $\pi_k$ 及其 advantage 函数 $A_k(s,a)$，定义

$$
I_k(\pi)
:=
\sum_{s\in\mathcal S}
d_{\pi_k}(s)
\left[
\sum_{a\in\mathcal A}
\pi(a\mid s)A_k(s,a)
-
\beta
D_{\mathrm{KL}}
\left(
\pi(\cdot\mid s)
\Vert
\pi_k(\cdot\mid s)
\right)
\right].
$$

**定义 4.8（Boltzmann 改进算子）.** 对每个状态 $s$，定义

$$
\mathcal B_\beta[\pi_k,A_k](a\mid s)
:=
\frac{
\pi_k(a\mid s)\exp(A_k(s,a)/\beta)
}
{
\sum_{b\in\mathcal A}
\pi_k(b\mid s)\exp(A_k(s,b)/\beta)
}.
$$

为了简记，后文记

$$
\pi_{B,k}(\cdot\mid s)
:=
\mathcal B_\beta[\pi_k,A_k](\cdot\mid s).
$$

**定理 4.9（KL 正则局部 RL 等价于对 Boltzmann teacher 的反向 KL 投影）.** 对任意固定状态 $s$，定义

$$
Z_k(s)
:=
\sum_{b\in\mathcal A}
\pi_k(b\mid s)\exp(A_k(s,b)/\beta).
$$

则有精确恒等式

$$
\sum_a
\pi(a\mid s)A_k(s,a)
-
\beta
D_{\mathrm{KL}}
\left(
\pi(\cdot\mid s)
\Vert
\pi_k(\cdot\mid s)
\right)
=
\beta\log Z_k(s)
-
\beta
D_{\mathrm{KL}}
\left(
\pi(\cdot\mid s)
\Vert
\pi_{B,k}(\cdot\mid s)
\right).
$$

因此

$$
I_k(\pi)
=
\sum_s
d_{\pi_k}(s)
\beta\log Z_k(s)
-
\beta
\sum_s
d_{\pi_k}(s)
D_{\mathrm{KL}}
\left(
\pi(\cdot\mid s)
\Vert
\pi_{B,k}(\cdot\mid s)
\right).
$$

故其最优解满足

$$
\arg\max_\pi I_k(\pi)
=
\left\{
\pi:
\pi(\cdot\mid s)=\pi_{B,k}(\cdot\mid s),
\quad
\forall s\in\operatorname{supp}(d_{\pi_k})
\right\}.
$$

**证明.** 固定状态 $s$，先计算

$$
\begin{aligned}
D_{\mathrm{KL}}(\pi(\cdot\mid s)\Vert \pi_{B,k}(\cdot\mid s))
&=
\sum_a
\pi(a\mid s)
\log
\frac{\pi(a\mid s)}
{\pi_{B,k}(a\mid s)}
\\
&=
\sum_a
\pi(a\mid s)
\log
\frac{\pi(a\mid s)}
{\pi_k(a\mid s)e^{A_k(s,a)/\beta}/Z_k(s)}
\\
&=
\sum_a
\pi(a\mid s)
\log
\frac{\pi(a\mid s)}
{\pi_k(a\mid s)}
-
\frac{1}{\beta}
\sum_a
\pi(a\mid s)A_k(s,a)
+
\log Z_k(s)
\\
&=
D_{\mathrm{KL}}(\pi(\cdot\mid s)\Vert\pi_k(\cdot\mid s))
-
\frac{1}{\beta}
\sum_a
\pi(a\mid s)A_k(s,a)
+
\log Z_k(s).
\end{aligned}
$$

移项可得

$$
\sum_a
\pi(a\mid s)A_k(s,a)
-
\beta D_{\mathrm{KL}}(\pi\Vert\pi_k)
=
\beta\log Z_k(s)
-
\beta D_{\mathrm{KL}}(\pi\Vert\pi_{B,k}).
$$

对所有状态乘上 $d_{\pi_k}(s)$ 再求和即得第二式。

最后，由 KL 非负性知，每个状态的最优值在且仅在 $\pi(\cdot\mid s)=\pi_{B,k}(\cdot\mid s)$ 时取得。

**推论 4.10（带 KL 正则的 RL 是 on-policy 的 reward-shaped self-distillation）.** 局部 RL 改进可以严格理解为：在当前策略自己的状态分布 $d_{\pi_k}$ 上，把策略投影到一个由 $\pi_k$ 与 $A_k$ 共同诱导出的 Boltzmann teacher $\pi_{B,k}$。

**注记 4.11.** 这条结论非常关键。它表明“RL 与蒸馏完全无关”并不准确。在 KL 正则视角下，RL 的确可以写成一种 teacher matching，只是这个 teacher 不是外部模型，而是由当前策略和 reward / advantage 共同定义出来的目标分布。

### 4.4 本节具体性质

**命题 4.12（Boltzmann teacher 的赔率比性质）.** 对任意固定状态 $s$ 和任意两个动作 $a,b$，若 $\pi_k(a\mid s),\pi_k(b\mid s)>0$，则

$$
\frac{\pi_{B,k}(a\mid s)}
{\pi_{B,k}(b\mid s)}
=
\frac{\pi_k(a\mid s)}
{\pi_k(b\mid s)}
\exp
\left(
\frac{A_k(s,a)-A_k(s,b)}
{\beta}
\right).
$$

也即 Boltzmann 改进在 log-odds 上等于“原 log-odds + advantage 差 / 温度”。

**证明.** 由定义

$$
\pi_{B,k}(a\mid s)
=
\frac{\pi_k(a\mid s)e^{A_k(s,a)/\beta}}
{Z_k(s)},
\qquad
\pi_{B,k}(b\mid s)
=
\frac{\pi_k(b\mid s)e^{A_k(s,b)/\beta}}
{Z_k(s)}.
$$

两式相除即可：

$$
\frac{\pi_{B,k}(a\mid s)}
{\pi_{B,k}(b\mid s)}
=
\frac{\pi_k(a\mid s)}
{\pi_k(b\mid s)}
e^{(A_k(s,a)-A_k(s,b))/\beta}.
$$

**命题 4.13（Boltzmann teacher 的温度极限）.** 固定状态 $s$，记优势最大动作集合

$$
M_s
:=
\arg\max_{a\in\mathcal A}
A_k(s,a).
$$

则有

$$
\lim_{\beta\to\infty}
\pi_{B,k}(\cdot\mid s)
=
\pi_k(\cdot\mid s),
$$

以及对任意动作 $a$，

$$
\lim_{\beta\to 0^+}
\pi_{B,k}(a\mid s)
=
\frac{
\pi_k(a\mid s)\mathbf 1\{a\in M_s\}
}
{
\sum_{b\in M_s}
\pi_k(b\mid s)
}.
$$

**证明.** 当 $\beta\to\infty$ 时，对每个动作都有

$$
e^{A_k(s,a)/\beta}
\to
1,
$$

故

$$
\pi_{B,k}(a\mid s)
=
\frac{
\pi_k(a\mid s)e^{A_k(s,a)/\beta}
}
{
\sum_b
\pi_k(b\mid s)e^{A_k(s,b)/\beta}
}
\to
\frac{
\pi_k(a\mid s)
}
{
\sum_b
\pi_k(b\mid s)
}
=
\pi_k(a\mid s).
$$

当 $\beta\to 0^+$ 时，设

$$
A_{\max}(s)
=
\max_b A_k(s,b).
$$

把分子分母同时除以 $e^{A_{\max}(s)/\beta}$：

$$
\pi_{B,k}(a\mid s)
=
\frac{
\pi_k(a\mid s)e^{(A_k(s,a)-A_{\max}(s))/\beta}
}
{
\sum_b
\pi_k(b\mid s)e^{(A_k(s,b)-A_{\max}(s))/\beta}
}.
$$

若 $a\notin M_s$，则指数项趋于 $0$；若 $a\in M_s$，则指数项趋于 $1$。于是极限正是题述结果。

**推论 4.14（精确改进差距等于加权反向 KL）.** 在定理 4.9 的条件下，

$$
I_k(\pi_{B,k})
-
I_k(\pi)
=
\beta
\sum_{s\in\mathcal S}
d_{\pi_k}(s)
D_{\mathrm{KL}}
\left(
\pi(\cdot\mid s)
\Vert
\pi_{B,k}(\cdot\mid s)
\right).
$$

**证明.** 把定理 4.9 中的恒等式分别代入 $\pi=\pi_{B,k}$ 与一般的 $\pi$。由于

$$
D_{\mathrm{KL}}(\pi_{B,k}\Vert\pi_{B,k})
=
0,
$$

相减即可得到上述等式。

**注记 4.15.** 这三条具体性质说明：RL 的 teacher 并不是抽象地“偏向高 reward”，而是以可计算的赔率比、温度极限、以及精确 improvement gap 形式出现。

## 附录 A：最小代码验证

### A.1 验证 Boltzmann teacher 与改进差距

下面的例子验证定理 4.9 和推论 4.14：KL 正则局部 RL 目标等于对 Boltzmann teacher 的反向 KL 投影，且改进差距正好是加权反向 KL。

```python
import torch

torch.manual_seed(0)

num_states = 3
num_actions = 5
beta = 0.7

pi_k = torch.softmax(torch.randn(num_states, num_actions), dim=-1)
advantage = torch.randn(num_states, num_actions)
d_pi_k = torch.tensor([3.0, 2.0, 0.5])

candidate = torch.softmax(torch.randn(num_states, num_actions), dim=-1)

weights = pi_k * torch.exp(advantage / beta)
z_k = weights.sum(dim=-1)
pi_b = weights / z_k[:, None]


def kl(p, q):
    return (p * (torch.log(p) - torch.log(q))).sum(dim=-1)


def local_objective(pi):
    reward_term = (pi * advantage).sum(dim=-1)
    regularizer = beta * kl(pi, pi_k)
    return (d_pi_k * (reward_term - regularizer)).sum()


lhs = local_objective(candidate)
rhs = (d_pi_k * (beta * torch.log(z_k) - beta * kl(candidate, pi_b))).sum()

teacher_value = local_objective(pi_b)
gap = teacher_value - lhs
expected_gap = beta * (d_pi_k * kl(candidate, pi_b)).sum()

print(torch.allclose(lhs, rhs, atol=1e-6))
print(torch.allclose(gap, expected_gap, atol=1e-6))
print(pi_b)
```

这里的 `pi_b` 就是由当前策略 `pi_k` 和 advantage 共同诱导出的 Boltzmann teacher。
