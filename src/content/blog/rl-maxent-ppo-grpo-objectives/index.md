---
title: '从普通 RL 到 GRPO：一条主线理解目标函数'
description: '把普通 RL、最大熵 RL、Policy Gradient、PPO 和 GRPO 放在同一条主线上，理解回报、熵、概率比、clip、critic 与组内相对优势。'
publishDate: '2026-05-15'
tags: ['强化学习', 'RL', 'PPO', 'GRPO', '最大熵', 'Policy Gradient', 'RLHF', 'LLM']
language: 'zh-CN'
draft: false
---

# 从普通 RL 到 GRPO：一条主线理解目标函数

这几个目标可以放在同一条主线上看：

$$
\boxed{\text{普通 RL：最大化回报}}
$$

$$
\boxed{\text{最大熵 RL：最大化回报 + 策略熵}}
$$

$$
\boxed{\text{PPO：用旧策略采样数据，稳定地优化新策略}}
$$

$$
\boxed{\text{GRPO：PPO-style clip + 组内相对优势}}
$$

直觉上，普通 RL 只问“这条轨迹拿了多少奖励”。最大熵 RL 在奖励之外再问“策略是不是还保留探索”。PPO 开始关心“新策略不要一次偏离旧策略太远”。GRPO 则把 PPO 里的 critic advantage 换成同一 prompt 下多个回答的组内相对分数。

---

## 1. 普通 RL：最大化轨迹回报

一条轨迹记为：

$$
\tau=(s_0,a_0,r_1,s_1,a_1,r_2,\ldots)
$$

在策略 $\pi_\theta$ 下，这条轨迹的概率是：

$$
p_\theta(\tau)
=
\rho_0(s_0)
\prod_{t=0}^{T-1}
\pi_\theta(a_t\mid s_t)
P(s_{t+1},r_{t+1}\mid s_t,a_t)
$$

如果轨迹回报定义为：

$$
R(\tau)
=
\sum_{t=0}^{T-1}\gamma^t r_{t+1}
$$

普通 RL 的目标就是：

$$
\boxed{
J_{\mathrm{RL}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_{t=0}^{T-1}\gamma^t r_{t+1}
\right]
}
$$

也可以展开成求和：

$$
J_{\mathrm{RL}}(\theta)
=
\sum_{\tau}
p_\theta(\tau)R(\tau)
$$

这个目标只关心一件事：

$$
\boxed{\text{这条轨迹拿到多少环境奖励}}
$$

---

## 2. 最大熵 RL：回报之外加上策略随机性

最大熵 RL 的目标可以写成：

$$
\boxed{
J_{\mathrm{MaxEnt}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_{t=0}^{T-1}
\gamma^t
\left(
r_{t+1}
+
\alpha H(\pi_\theta(\cdot\mid s_t))
\right)
\right]
}
$$

其中：

$$
H(\pi_\theta(\cdot\mid s_t))
=
-
\sum_a
\pi_\theta(a\mid s_t)
\log \pi_\theta(a\mid s_t)
$$

连续动作时，把求和换成积分：

$$
H(\pi_\theta(\cdot\mid s_t))
=
-
\int
\pi_\theta(a\mid s_t)
\log \pi_\theta(a\mid s_t)
\,da
$$

$\alpha>0$ 控制熵奖励强度。$\alpha$ 越大，策略越不愿意过早坍缩到单一动作。

### 2.1 和普通 RL 的关系

普通目标是：

$$
J_{\mathrm{RL}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t\gamma^t r_{t+1}
\right]
$$

最大熵目标是：

$$
J_{\mathrm{MaxEnt}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t\gamma^t
\left(
r_{t+1}
+
\alpha H(\pi_\theta(\cdot\mid s_t))
\right)
\right]
$$

所以最大熵 RL 等价于把每一步奖励改成 soft reward：

$$
\boxed{
r^{\mathrm{soft}}_{t+1}
=
r_{t+1}
+
\alpha H(\pi_\theta(\cdot\mid s_t))
}
$$

它鼓励两件事：

1. 拿到高回报。
2. 保持高熵，也就是不要太早确定只选一个动作。

### 2.2 采样动作形式

因为：

$$
H(\pi_\theta(\cdot\mid s_t))
=
\mathbb{E}_{a_t\sim\pi_\theta(\cdot\mid s_t)}
\left[
-\log \pi_\theta(a_t\mid s_t)
\right]
$$

所以最大熵目标也可以写成：

$$
\boxed{
J_{\mathrm{MaxEnt}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
\gamma^t
\left(
r_{t+1}
-
\alpha\log\pi_\theta(a_t\mid s_t)
\right)
\right]
}
$$

也就是说，$\alpha H(\pi_\theta(\cdot\mid s_t))$ 对应采样动作形式里的 $-\alpha\log\pi_\theta(a_t\mid s_t)$。

---

## 3. Policy Gradient：怎样优化这个期望

普通 RL 目标是：

$$
J_{\mathrm{RL}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}[R(\tau)]
$$

用 log-derivative trick 可以得到：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
R(\tau)\nabla_\theta\log p_\theta(\tau)
\right]
$$

而环境转移概率通常不依赖 $\theta$，所以：

$$
\nabla_\theta\log p_\theta(\tau)
=
\sum_t
\nabla_\theta\log \pi_\theta(a_t\mid s_t)
$$

于是：

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
R(\tau)
\sum_t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
}
$$

更常见的是 return-to-go：

$$
G_t
=
\sum_{k=t}^{T-1}
\gamma^{k-t}r_{k+1}
$$

对应梯度：

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
G_t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
}
$$

为了降低方差，通常再引入 baseline，得到 advantage：

$$
A_t
=
G_t-V(s_t)
$$

于是：

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
A_t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
}
$$

这一步很关键：后面的 PPO 和 GRPO，本质上都在围绕“怎么构造一个好用、稳定、低成本的 advantage”展开。

---

## 4. PPO：旧策略采样，新策略稳定更新

PPO 的核心设置是：数据来自旧策略

$$
\pi_{\theta_{\mathrm{old}}}
$$

但我们要更新的是新策略

$$
\pi_\theta
$$

因此需要引入概率比：

$$
\boxed{
\rho_t(\theta)
=
\frac{
\pi_\theta(a_t\mid s_t)
}{
\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)
}
}
$$

这里用 $\rho_t$ 表示 ratio，避免和奖励 $r_t$ 混淆。

### 4.1 未裁剪 surrogate

PPO 的未裁剪 policy-gradient surrogate 是：

$$
\boxed{
L^{\mathrm{PG}}(\theta)
=
\mathbb{E}_{t\sim \pi_{\theta_{\mathrm{old}}}}
\left[
\rho_t(\theta)A_t
\right]
}
$$

写成轨迹形式：

$$
\boxed{
L^{\mathrm{PG}}(\theta)
=
\mathbb{E}_{\tau\sim p_{\theta_{\mathrm{old}}}}
\left[
\sum_t
\rho_t(\theta)A_t
\right]
}
$$

注意这里的期望不是对新策略采样，而是对旧策略采样得到的数据取平均。

### 4.2 PPO-Clip 目标

PPO 实际常用 clipped objective：

$$
\boxed{
L^{\mathrm{CLIP}}(\theta)
=
\mathbb{E}_{\tau\sim p_{\theta_{\mathrm{old}}}}
\left[
\sum_t
\min
\left(
\rho_t(\theta)\hat A_t,\,
\operatorname{clip}(\rho_t(\theta),1-\epsilon,1+\epsilon)\hat A_t
\right)
\right]
}
$$

其中，$\operatorname{clip}(\rho,1-\epsilon,1+\epsilon)$ 表示把概率比限制在区间 $[1-\epsilon,1+\epsilon]$ 里。

直觉如下：

| 情况 | 想做什么 | PPO 的限制 |
| --- | --- | --- |
| $\hat A_t>0$ | 这个动作比预期好，提高它的概率 | 不允许 $\rho_t(\theta)$ 变得太大 |
| $\hat A_t<0$ | 这个动作比预期差，降低它的概率 | 不允许 $\rho_t(\theta)$ 变得太小 |

所以 PPO 的作用是：

$$
\boxed{\text{让策略变好，但每次不要变太猛}}
$$

### 4.3 PPO 的完整训练损失

实际 PPO 常常还包括 value loss 和 entropy bonus：

$$
\boxed{
L^{\mathrm{PPO}}(\theta,\phi)
=
\mathbb{E}_{\tau\sim p_{\theta_{\mathrm{old}}}}
\left[
\sum_t
\left(
L_t^{\mathrm{CLIP}}(\theta)
-
c_1
\left(
V_\phi(s_t)-G_t
\right)^2
+
c_2
H(\pi_\theta(\cdot\mid s_t))
\right)
\right]
}
$$

其中，$V_\phi(s_t)$ 是 critic。Advantage 通常由 critic 给出：

$$
\hat A_t
=
G_t-V_\phi(s_t)
$$

也可以用 GAE：

$$
\hat A_t
=
\sum_{l=0}^{\infty}
(\gamma\lambda)^l
\delta_{t+l}
$$

$$
\delta_t
=
r_{t+1}
+
\gamma V_\phi(s_{t+1})
-
V_\phi(s_t)
$$

所以 PPO 的关键成本也在这里：

$$
\boxed{\text{需要 advantage，通常需要 value function / critic}}
$$

---

## 5. GRPO：用组内相对优势替代 critic

GRPO 可以理解成 PPO 风格的目标，但 advantage 不再来自 critic：

$$
\hat A_t
=
G_t-V(s_t)
$$

而是来自同一个 prompt 下多个回答的相对分数。

设 prompt 是 $q$。从旧策略采样 $G$ 个回答：

$$
o_1,o_2,\ldots,o_G
\sim
\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
$$

每个回答得到一个 reward：

$$
R_i
=
R(q,o_i)
$$

计算组内均值：

$$
\bar R
=
\frac{1}{G}
\sum_{j=1}^{G}R_j
$$

组内标准差：

$$
s_R
=
\sqrt{
\frac{1}{G}
\sum_{j=1}^{G}
(R_j-\bar R)^2
}
$$

然后定义 group-relative advantage：

$$
\boxed{
\hat A_i
=
\frac{
R_i-\bar R
}{
s_R+\varepsilon
}
}
$$

通常同一个回答 $o_i$ 的所有 token 共享同一个优势：

$$
\hat A_{i,t}
=
\hat A_i
$$

这就是 GRPO 的核心替换：

$$
\boxed{
\text{critic baseline}
\quad\Longrightarrow\quad
\text{group mean baseline}
}
$$

### 5.1 GRPO 的 token 概率比

对第 $i$ 个回答的第 $t$ 个 token：

$$
o_{i,t}
$$

它的上下文是：

$$
(q,o_{i,<t})
$$

概率比为：

$$
\boxed{
\rho_{i,t}(\theta)
=
\frac{
\pi_\theta(o_{i,t}\mid q,o_{i,<t})
}{
\pi_{\theta_{\mathrm{old}}}(o_{i,t}\mid q,o_{i,<t})
}
}
$$

和 PPO 一样，ratio 衡量“新策略相对旧策略，把这个 token 的概率改了多少”。

### 5.2 GRPO-Clip 目标

GRPO 的典型目标可以写成：

$$
\boxed{
\begin{aligned}
L^{\mathrm{GRPO}}(\theta)
=
\mathbb{E}_{\substack{
q\sim \mathcal{D},\\
\{o_i\}_{i=1}^{G}\sim \pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
}}
\Bigg[
&\frac{1}{G}
\sum_{i=1}^{G}
\frac{1}{|o_i|}
\sum_{t=1}^{|o_i|}
\\
&\left(
\min
\left(
\rho_{i,t}(\theta)\hat A_i,\,
\operatorname{clip}(\rho_{i,t}(\theta),1-\epsilon,1+\epsilon)\hat A_i
\right)
-
\beta D_{\mathrm{KL}}^{i,t}
\right)
\Bigg]
\end{aligned}
}
$$

其中，$D_{\mathrm{KL}}^{i,t}$ 通常表示当前策略与 reference policy 在该 token 上下文处的 KL 惩罚。例如：

$$
D_{\mathrm{KL}}^{i,t}
=
D_{\mathrm{KL}}
\left(
\pi_\theta(\cdot\mid q,o_{i,<t})
\;\middle\|\;
\pi_{\mathrm{ref}}(\cdot\mid q,o_{i,<t})
\right)
$$

$\beta>0$ 控制当前策略不要偏离 reference model 太远。

---

## 6. PPO 和 GRPO 的核心区别

| 项目 | PPO | GRPO |
| --- | --- | --- |
| 数据来源 | 旧策略 rollout | 同一 prompt 下旧策略采样一组回答 |
| 概率比 | $\rho_t=\frac{\pi_\theta(a_t\mid s_t)}{\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)}$ | $\rho_{i,t}=\frac{\pi_\theta(o_{i,t}\mid q,o_{i,<t})}{\pi_{\theta_{\mathrm{old}}}(o_{i,t}\mid q,o_{i,<t})}$ |
| advantage | $\hat A_t=G_t-V_\phi(s_t)$ 或 GAE | $\hat A_i=\frac{R_i-\bar R}{s_R+\varepsilon}$ |
| critic | 通常需要 | 通常不需要 |
| baseline | value function baseline | group mean baseline |
| 主要场景 | 通用 RL、RLHF | LLM reasoning、outcome reward、多回答组内比较 |
| 目标形式 | clipped policy surrogate | group-relative clipped surrogate |

一句话：

> **PPO 用 critic 估计“这个动作比状态平均水平好多少”；GRPO 用同一 prompt 的一组回答估计“这个回答比组内平均好多少”。**

---

## 7. 把几个期望形式单独列出来

### 7.1 普通 RL

$$
\boxed{
J_{\mathrm{RL}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
[R(\tau)]
}
$$

如果 $R(\tau)=\sum_t\gamma^t r_{t+1}$，则：

$$
\boxed{
J_{\mathrm{RL}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t\gamma^t r_{t+1}
\right]
}
$$

### 7.2 最大熵 RL

$$
\boxed{
J_{\mathrm{MaxEnt}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
\gamma^t
\left(
r_{t+1}
+
\alpha H(\pi_\theta(\cdot\mid s_t))
\right)
\right]
}
$$

等价的采样动作形式是：

$$
\boxed{
J_{\mathrm{MaxEnt}}(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
\gamma^t
\left(
r_{t+1}
-
\alpha\log\pi_\theta(a_t\mid s_t)
\right)
\right]
}
$$

### 7.3 REINFORCE / Policy Gradient

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
G_t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
}
$$

Advantage 形式是：

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t
A_t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\right]
}
$$

### 7.4 PPO

$$
\boxed{
L^{\mathrm{PPO}}(\theta)
=
\mathbb{E}_{\tau\sim p_{\theta_{\mathrm{old}}}}
\left[
\sum_t
\min
\left(
\rho_t(\theta)\hat A_t,\,
\operatorname{clip}(\rho_t(\theta),1-\epsilon,1+\epsilon)\hat A_t
\right)
\right]
}
$$

其中：

$$
\boxed{
\rho_t(\theta)
=
\frac{
\pi_\theta(a_t\mid s_t)
}{
\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)
}
}
$$

$$
\boxed{
\hat A_t
=
G_t-V_\phi(s_t)
}
$$

或者用 GAE。

### 7.5 GRPO

$$
\boxed{
\begin{aligned}
L^{\mathrm{GRPO}}(\theta)
=
\mathbb{E}_{\substack{
q\sim\mathcal D,\\
\{o_i\}_{i=1}^{G}\sim\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
}}
\Bigg[
&\frac{1}{G}
\sum_{i=1}^{G}
\frac{1}{|o_i|}
\sum_{t=1}^{|o_i|}
\\
&\left(
\min
\left(
\rho_{i,t}(\theta)\hat A_i,\,
\operatorname{clip}(\rho_{i,t}(\theta),1-\epsilon,1+\epsilon)\hat A_i
\right)
-
\beta D_{\mathrm{KL}}^{i,t}
\right)
\Bigg]
\end{aligned}
}
$$

其中：

$$
\boxed{
\rho_{i,t}(\theta)
=
\frac{
\pi_\theta(o_{i,t}\mid q,o_{i,<t})
}{
\pi_{\theta_{\mathrm{old}}}(o_{i,t}\mid q,o_{i,<t})
}
}
$$

$$
\boxed{
\hat A_i
=
\frac{
R(q,o_i)-\frac{1}{G}\sum_{j=1}^{G}R(q,o_j)
}{
\sqrt{
\frac{1}{G}
\sum_{j=1}^{G}
(R(q,o_j)-\bar R)^2
}
+\varepsilon
}
}
$$

---

## 8. 最核心总结

普通 RL：

$$
\boxed{\text{最大化环境回报}}
$$

$$
J_{\mathrm{RL}}
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t\gamma^t r_t
\right]
$$

最大熵 RL：

$$
\boxed{\text{最大化环境回报 + 策略随机性}}
$$

$$
J_{\mathrm{MaxEnt}}
=
\mathbb{E}_{\tau\sim p_\theta}
\left[
\sum_t\gamma^t
\left(
r_t+\alpha H(\pi(\cdot\mid s_t))
\right)
\right]
$$

PPO：

$$
\boxed{\text{用旧策略数据和概率比，稳定更新新策略}}
$$

$$
L^{\mathrm{PPO}}
=
\mathbb{E}_{\tau\sim p_{\theta_{\mathrm{old}}}}
\left[
\text{clipped ratio}\times \text{advantage}
\right]
$$

GRPO：

$$
\boxed{\text{用一组回答的相对奖励替代 critic advantage}}
$$

$$
L^{\mathrm{GRPO}}
=
\mathbb{E}_{q,\{o_i\}}
\left[
\text{clipped token ratio}\times \text{group-relative advantage}
-
\text{KL penalty}
\right]
$$

所以这条主线可以压缩成一句话：

> **RL 从“最大化回报”出发；最大熵 RL 加入探索；PPO 用旧策略数据、ratio 和 clip 稳定更新；GRPO 保留 PPO 的稳定更新形式，但用同题多回答的组内相对奖励替代 critic advantage。**
