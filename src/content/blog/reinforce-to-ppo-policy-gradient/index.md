---
title: '从 REINFORCE 到 PPO'
description: '从 MDP 单步概率出发，推导策略梯度、reward-to-go、baseline、advantage、Actor-Critic、GAE，以及 PPO 的 ratio 与 clip。'
publishDate: '2026-05-14'
tags: ['强化学习', 'Policy Gradient', 'REINFORCE', 'Actor-Critic', 'GAE', 'PPO', 'RLHF', 'LLM']
language: 'zh-CN'
draft: false
---

# 从 REINFORCE 到 PPO

从策略梯度到 PPO，可以压缩成一条主线：

```text
MDP 单步概率
    ↓
轨迹概率 = 单步概率连乘
    ↓
目标函数 J(theta) = 期望回报
    ↓
直接求导困难
    ↓
Log-Gradient Trick
    ↓
REINFORCE / Vanilla Policy Gradient
    ↓
方差高，策略更新幅度不受控
    ↓
Reward-to-go / Baseline / Advantage
    ↓
Actor-Critic
    ↓
GAE：平衡偏差和方差
    ↓
TRPO：用 KL 约束限制策略更新幅度
    ↓
PPO：用 ratio + clip 做稳定更新
```

这条线索回答一个问题：当训练样本来自模型自己的采样时，怎样把 reward 变成可优化的梯度信号，并让更新过程保持稳定。

---

## 1. 单步概率

强化学习的基本交互单元是：

$$
P(a_t,s_{t+1}\mid s_t)
=
\pi_\theta(a_t\mid s_t)P(s_{t+1}\mid s_t,a_t)
$$

这个式子把一步交互拆成两部分：

```text
智能体按照策略选择动作。
环境根据当前状态和动作转移到下一个状态。
```

在 LLM 生成任务中，状态可以理解为 prompt 加上已经生成的前缀，动作是下一个 token。上下文拼接基本由解码过程确定，因此单步概率通常写成：

$$
\pi_\theta(o_t\mid q,o_{<t})
$$

含义是：给定 prompt $q$ 和已有 token $o_{<t}$，模型预测下一个 token $o_t$ 的概率。

---

## 2. 从单步到整条轨迹

一条轨迹的概率由每一步的动作概率和环境转移概率连乘得到。设

$$
\tau=(s_0,a_0,s_1,a_1,\ldots,s_T)
$$

则：

$$
p_\theta(\tau)
=
\rho_0(s_0)
\prod_{t=0}^{T-1}
\pi_\theta(a_t\mid s_t)
P(s_{t+1}\mid s_t,a_t)
$$

其中 $\rho_0(s_0)$ 是初始状态分布。

LLM 生成可以写成：

$$
p_\theta(o\mid q)
=
\prod_{t=1}^{T}
\pi_\theta(o_t\mid q,o_{<t})
$$

所以，一段完整回答的概率是每个 token 条件概率的连乘。

---

## 3. 原始目标：最大化期望回报

策略优化的目标是最大化期望回报：

$$
J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta(\tau)}
\left[
R(\tau)
\right]
$$

LLM 场景中，可以写成：

$$
J(\theta)
=
\mathbb{E}_{o\sim \pi_\theta(\cdot\mid q)}
\left[
R(q,o)
\right]
$$

期望符号里包含采样分布。展开后，参数 $\theta$ 的位置就清楚了：

$$
J(\theta)
=
\sum_o
\pi_\theta(o\mid q)R(q,o)
$$

这里假设 reward model 固定，不参与当前策略更新。因此 $R(q,o)$ 对 $\theta$ 是常数：

$$
\nabla_\theta J(\theta)
=
\sum_o
\nabla_\theta \pi_\theta(o\mid q)
R(q,o)
$$

$\nabla_\theta \pi_\theta(o\mid q)$ 就来自这里：采样分布本身依赖模型参数。$\theta$ 改变每个回答的生成概率，$J(\theta)$ 随之变化。

一般强化学习写法只是把完整回答 $o$ 换成轨迹 $\tau$：

$$
J(\theta)
=
\int
p_\theta(\tau)R(\tau)d\tau
$$

$$
\nabla_\theta J(\theta)
=
\int
\nabla_\theta p_\theta(\tau)R(\tau)d\tau
$$

因此，$\nabla_\theta p_\theta(\tau)$ 和 LLM 写法里的 $\nabla_\theta \pi_\theta(o\mid q)$ 位于同一个位置。

| 一般强化学习 | LLM 生成 |
| --- | --- |
| $\tau$ | 完整回答 $o$ |
| $p_\theta(\tau)$ | $\pi_\theta(o\mid q)$ |
| $R(\tau)$ | $R(q,o)$ |
| $\nabla_\theta p_\theta(\tau)$ | $\nabla_\theta \pi_\theta(o\mid q)$ |

训练过程可以概括为：从当前模型采样回答，用 reward model、规则验证器或环境反馈给回答打分，再提高高回报回答在对应上下文下出现的概率。

---

## 4. Log-Gradient Trick

上一节已经得到 $\nabla_\theta p_\theta(\tau)$。这个量不能直接采样，也不能直接作为采样权重使用。

关键恒等式是：

$$
\nabla_\theta p_\theta(\tau)
=
p_\theta(\tau)\nabla_\theta\log p_\theta(\tau)
$$

代入期望目标：

$$
\begin{aligned}
\nabla_\theta J(\theta)
&=
\nabla_\theta
\int p_\theta(\tau)R(\tau)d\tau \\
&=
\int \nabla_\theta p_\theta(\tau)R(\tau)d\tau \\
&=
\int p_\theta(\tau)
\nabla_\theta\log p_\theta(\tau)
R(\tau)d\tau \\
&=
\mathbb{E}_{\tau\sim p_\theta}
\left[
R(\tau)\nabla_\theta\log p_\theta(\tau)
\right]
\end{aligned}
$$

这一步把分布梯度转换成了可采样的期望估计。

---

## 5. Log 概率：连乘变连加

轨迹概率中，只有策略项依赖 $\theta$。环境转移概率通常不依赖策略参数，因此：

$$
\log p_\theta(\tau)
=
\log \rho_0(s_0)
+
\sum_{t=0}^{T-1}
\log \pi_\theta(a_t\mid s_t)
+
\sum_{t=0}^{T-1}
\log P(s_{t+1}\mid s_t,a_t)
$$

对 $\theta$ 求导后，初始状态分布和环境转移项消失：

$$
\nabla_\theta \log p_\theta(\tau)
=
\sum_{t=0}^{T-1}
\nabla_\theta
\log \pi_\theta(a_t\mid s_t)
$$

于是得到 REINFORCE：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}
\left[
R(\tau)
\sum_{t=0}^{T-1}
\nabla_\theta
\log \pi_\theta(a_t\mid s_t)
\right]
$$

计算时，可以采样一条轨迹，计算总回报 $R(\tau)$，再用这个回报给轨迹中每个动作的 log probability 梯度加权。

当 $R(\tau)$ 较高时，这条轨迹上的动作概率会被整体提高；当 $R(\tau)$ 较低时，这些动作概率会被压低。

---

## 6. REINFORCE 的问题

REINFORCE 给出了策略梯度的基本形式，但训练信号不够精细。

主要问题有两个：

1. 方差高。整条轨迹的总回报会影响所有动作，即使某些动作与最终结果关系很弱。
2. 更新幅度缺少约束。一次高回报样本可能带来过大的概率变化，使策略偏移到不稳定区域。

后续方法大多沿着两个方向改进：降低梯度估计方差，并限制策略更新幅度。

---

## 7. Reward-to-go

原始 REINFORCE 用整条轨迹的总回报 $R(\tau)$ 给每个动作加权。更细的做法是让第 $t$ 步动作只关联从当前时刻开始的未来回报：

$$
G_t
=
\sum_{k=t}^{T-1}\gamma^{k-t}r_k
$$

策略梯度变为：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}
\left[
\sum_{t=0}^{T-1}
G_t
\nabla_\theta
\log\pi_\theta(a_t\mid s_t)
\right]
$$

这里的 $\gamma$ 是折扣因子。$G_t$ 会减少过去奖励对当前动作的干扰，使每一步动作的信用分配更贴近时间因果结构。

---

## 8. Baseline 与 Advantage

只看绝对回报会导致误判。一个动作得到 80 分，在某些状态下可能已经很好；在另一些状态下，平均水平可能是 95 分。

因此引入 baseline：

$$
G_t-b(s_t)
$$

只要 $b(s_t)$ 不依赖动作 $a_t$，它不会改变策略梯度的期望：

$$
\mathbb{E}_{a_t\sim\pi_\theta}
\left[
b(s_t)\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
=
0
$$

最常见的 baseline 是价值函数：

$$
V^\pi(s_t)
=
\mathbb{E}_\pi[G_t\mid s_t]
$$

于是得到 advantage：

$$
A_t
=
G_t - V^\pi(s_t)
$$

$A_t$ 衡量当前动作相对该状态平均水平的好坏：

```text
A_t > 0：提高该动作在该状态下的概率。
A_t < 0：降低该动作在该状态下的概率。
```

策略梯度变为：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}
\left[
\sum_{t=0}^{T-1}
A_t
\nabla_\theta
\log\pi_\theta(a_t\mid s_t)
\right]
$$

---

## 9. Actor-Critic

Actor-Critic 把策略学习和价值估计拆开：

$$
\text{Actor: }\pi_\theta(a\mid s)
$$

$$
\text{Critic: }V_\phi(s)
$$

Actor 生成动作，Critic 估计当前状态的期望回报。Critic 提供 baseline，Actor 使用 advantage 更新策略：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}
\left[
\sum_{t=0}^{T-1}
A_t
\nabla_\theta
\log\pi_\theta(a_t\mid s_t)
\right]
$$

实践中，$A_t$ 常用 $V_\phi$ 构造：

$$
A_t
\approx
G_t - V_\phi(s_t)
$$

这比直接使用整条轨迹回报更稳定，因为每一步更新都参考了当前状态的平均水平。

---

## 10. GAE

实际训练中，advantage 常用 Generalized Advantage Estimation（GAE）估计。

先定义 TD residual：

$$
\delta_t
=
r_t+\gamma V_\phi(s_{t+1})-V_\phi(s_t)
$$

GAE 把多个时间尺度上的 TD residual 加权求和：

$$
A_t^{\mathrm{GAE}}
=
\sum_{l=0}^{\infty}
(\gamma\lambda)^l
\delta_{t+l}
$$

$\lambda$ 控制估计方式：

| $\lambda$ | 倾向 | 特点 |
| --- | --- | --- |
| 接近 0 | 短期 TD 估计 | 方差较低，偏差较高 |
| 接近 1 | 长期 Monte Carlo 估计 | 偏差较低，方差较高 |

GAE 的作用是给 bias-variance trade-off 一个连续调节旋钮。

---

## 11. Importance Sampling Ratio

PPO 使用旧策略采样数据，再用新策略更新参数。为了比较新旧策略对同一动作的概率变化，引入 ratio：

$$
r_t(\theta)
=
\frac{
\pi_\theta(a_t\mid s_t)
}{
\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)
}
$$

这个 ratio 表示新策略相对旧策略给该动作分配的概率倍数：

| $r_t(\theta)$ | 含义 |
| --- | --- |
| $1.0$ | 新旧策略概率相同 |
| $1.2$ | 该动作概率提高 20% |
| $0.8$ | 该动作概率降低 20% |

没有裁剪时，surrogate objective 可以写成：

$$
L^{\mathrm{PG}}(\theta)
=
\mathbb{E}
\left[
r_t(\theta)A_t
\right]
$$

如果 $A_t>0$，增大 $r_t$ 会提高目标；如果 $A_t<0$，减小 $r_t$ 会提高目标。

---

## 12. PPO Clip

PPO 的 clipped objective 是：

$$
L^{\mathrm{CLIP}}(\theta)
=
\mathbb{E}
\left[
\min
\left(
r_t(\theta)A_t,
\operatorname{clip}(r_t(\theta),1-\epsilon,1+\epsilon)A_t
\right)
\right]
$$

clip 把 ratio 限制在区间：

$$
[1-\epsilon,1+\epsilon]
$$

它的效果是限制单次更新对动作概率的改变量。对于 advantage 为正的动作，概率可以提高，但超过 $1+\epsilon$ 后不再继续获得额外收益。对于 advantage 为负的动作，概率可以降低，但低于 $1-\epsilon$ 后也不会继续带来额外收益。

因此，PPO 的优化目标鼓励策略变好，同时压制幅度过大的概率变化。

---

## 13. 从 REINFORCE 到 PPO 的对照表

| 阶段 | 核心形式 | 解决的问题 |
| --- | --- | --- |
| REINFORCE | $R(\tau)\nabla\log\pi$ | 把分布梯度转成可采样期望 |
| Reward-to-go | $G_t\nabla\log\pi$ | 让动作主要关联未来回报 |
| Baseline | $(G_t-b_t)\nabla\log\pi$ | 在不改变期望的情况下降低方差 |
| Advantage | $A_t\nabla\log\pi$ | 衡量动作相对状态平均水平的收益 |
| Actor-Critic | $\pi_\theta + V_\phi$ | 用 Critic 学习 baseline |
| GAE | $A_t^{\mathrm{GAE}}$ | 平衡偏差和方差 |
| TRPO | KL 约束 | 限制策略更新幅度 |
| PPO | ratio + clip | 用简单目标近似稳定策略更新 |

---

## 14. 梯度上升与梯度下降

理论目标是最大化：

$$
J(\theta)
$$

因此数学上使用梯度上升：

$$
\theta
\leftarrow
\theta
+
\alpha
\nabla_\theta J(\theta)
$$

深度学习框架通常最小化 loss，所以实现里会定义：

$$
\mathcal{L}_{\mathrm{policy}}
=
-
L^{\mathrm{CLIP}}(\theta)
$$

训练时最小化 $\mathcal{L}_{\mathrm{policy}}$，等价于最大化 PPO objective。

---

## 15. LLM 中的 PPO

LLM 里的对应关系如下：

| 强化学习概念 | LLM 生成任务中的含义 |
| --- | --- |
| 状态 $s_t$ | prompt 加已生成 token 前缀 |
| 动作 $a_t$ | 下一个 token |
| 策略 $\pi_\theta$ | 语言模型 |
| 轨迹 $\tau$ | 完整回答 |
| 奖励 $R$ | reward model、规则验证器或环境反馈给出的分数 |
| Critic $V_\phi$ | value head 对当前前缀未来回报的估计 |
| Advantage $A_t$ | 当前 token 相对该前缀平均水平的收益 |
| PPO Clip | 限制新模型相对旧模型的概率变化 |

在 token 级别，核心训练信号是：

$$
A_t
\nabla_\theta
\log\pi_\theta(o_t\mid q,o_{<t})
$$

含义是：如果某个 token 对应正 advantage，就提高它在该上下文下的概率；如果对应负 advantage，就降低它在该上下文下的概率。

实际 RLHF 训练还常加入 KL penalty，使 policy 不会过度偏离 reference model：

$$
\mathrm{KL}
\left(
\pi_\theta(\cdot\mid q,o_{<t})
\Vert
\pi_{\mathrm{ref}}(\cdot\mid q,o_{<t})
\right)
$$

这样可以同时使用 reward 信号和参考模型约束。

---

## 16. 总结

从 REINFORCE 到 PPO 的主线可以概括为：

```text
先把轨迹概率写成动作概率连乘；
再用 log-gradient trick 把目标梯度写成可采样期望；
然后用 reward-to-go、baseline 和 advantage 降低方差；
再用 critic 学习状态价值，并用 GAE 稳定 advantage 估计；
最后用 ratio + clip 限制新旧策略差距。
```

四个关键问题对应四类方法：

| 问题 | 对应方法 |
| --- | --- |
| 怎样从采样中得到梯度 | Policy Gradient |
| 怎样判断动作相对好坏 | Advantage |
| 怎样估计状态平均水平 | Actor-Critic |
| 怎样限制单次更新幅度 | PPO Clip |

PPO 的价值在于把策略梯度、优势估计和保守更新合在一个相对简单的训练目标里，使在线采样的策略优化在工程上更容易稳定运行。
