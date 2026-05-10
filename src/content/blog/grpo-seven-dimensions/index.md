---
title: '理解 GRPO 的 7 个元维度'
description: '从 PPO 的 critic 成本讲起，推导 GRPO 如何用同题多答案的组内相对奖励替代 value baseline，并用 clipping 与 KL 稳定更新。'
publishDate: '2026-05-10'
tags: ['GRPO', 'DeepSeek-R1', 'RLHF', 'PPO', 'DPO', '强化学习', 'LLM', '机器学习']
language: 'zh-CN'
draft: false
---

# 理解 GRPO 的 7 个元维度

核心模型如下：

> **GRPO = 在同一个 prompt 下采样多条回答，用组内相对奖励替代 PPO 中的 value / critic baseline，再通过 PPO-style clipping 和 KL 正则约束 policy 更新。**

DeepSeekMath 系统提出 Group Relative Policy Optimization（GRPO），并将其描述为 PPO 的变体。GRPO 不训练单独的 critic model，而从同一 prompt 下多条回答的 reward 中构造相对 advantage，从而降低大模型 RL 阶段的训练资源消耗。DeepSeek-R1 / R1-Zero 后续也将 GRPO 用在大规模 reasoning RL 中。

GRPO 可以从 7 个元维度理解：

| 维度 | 核心问题 |
| --- | --- |
| Background | GRPO 位于 LLM post-training 的哪个阶段？ |
| Motivation | PPO 的 critic 成本为什么会成为瓶颈？ |
| Objective | GRPO 的优化目标从何而来？ |
| Baseline | 组内平均 reward 如何替代 value baseline？ |
| Stability | clipping 与 KL 如何限制 policy 漂移？ |
| Applicability | 哪类任务最适合 GRPO？ |
| System cost | 去掉 critic 带来哪些工程收益？ |

---

## 1. Background：GRPO 的位置

GRPO 的背景是 **LLM post-training 中的 RL 阶段**。

常见的 RLHF / RLAIF 流程可以写成：

$$
\text{Base Model}
\rightarrow
\text{SFT}
\rightarrow
\text{Reward Model / Verifier}
\rightarrow
\text{RL Optimization}
$$

在 InstructGPT 以来的许多对齐流程中，RL 阶段常使用 PPO。PPO 的核心思想是：policy 向高 reward 方向更新，同时通过 clipped surrogate objective 限制新旧 policy 的概率比，避免一次更新幅度过大。

放到 LLM 场景中，PPO 系统通常包含：

$$
\text{policy model}
+
\text{reference model}
+
\text{reward model}
+
\text{value / critic model}
$$

其中，**value / critic model** 用来估计某个状态、token 或 response 的未来价值。该估计进入 advantage：

$$
A_t
=
Q(s_t,a_t)-V(s_t)
$$

在实践中，PPO 常用 Generalized Advantage Estimation（GAE）构造 $A_t$：

$$
\delta_t
=
r_t+\gamma V_\phi(s_{t+1})-V_\phi(s_t)
$$

$$
A_t^{\mathrm{GAE}(\gamma,\lambda)}
=
\sum_{l=0}^{\infty}
(\gamma\lambda)^l\delta_{t+l}
$$

这要求训练一个额外的 $V_\phi$。对 LLM 而言，critic 往往也是大模型级别网络，显存、计算和稳定性成本都很高。长 CoT reasoning 还会进一步放大 value learning 的困难：最终 reward 可能只在答案末尾出现，但 value model 需要在中间 token 上估计未来收益。

GRPO 的入口正是 critic 的替代问题：

$$
\text{critic baseline}
\quad\Longrightarrow\quad
\text{group reward baseline}
$$

---

## 2. Motivation：PPO 的瓶颈

GRPO 的 motivation 可以压缩成三点。

### 2.1 PPO 的 critic 成本高

标准 policy gradient 的目标是最大化期望回报：

$$
J(\theta)
=
\mathbb{E}_{q\sim P(Q),\,o\sim \pi_\theta(\cdot\mid q)}
\left[
R(q,o)
\right]
$$

LLM 的 completion $o$ 是一个 token 序列：

$$
o=(y_1,y_2,\ldots,y_T)
$$

自回归 policy 为：

$$
\pi_\theta(o\mid q)
=
\prod_{t=1}^{T}
\pi_\theta(y_t\mid q,y_{<t})
$$

因此 log probability 可以展开为：

$$
\log \pi_\theta(o\mid q)
=
\sum_{t=1}^{T}
\log \pi_\theta(y_t\mid q,y_{<t})
$$

由 score function identity 得到 policy gradient：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}_{q,o}
\left[
R(q,o)\nabla_\theta\log \pi_\theta(o\mid q)
\right]
$$

如果直接使用 $R(q,o)$ 作为梯度系数，方差通常较大。引入 baseline $b(q)$ 后：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}_{q,o}
\left[
(R(q,o)-b(q))
\nabla_\theta\log \pi_\theta(o\mid q)
\right]
$$

只要 $b(q)$ 不依赖当前采样动作 $o$，该 baseline 不改变梯度期望。证明如下：

$$
\mathbb{E}_{o\sim\pi_\theta}
\left[
b(q)\nabla_\theta\log \pi_\theta(o\mid q)
\right]
=
b(q)
\sum_o
\pi_\theta(o\mid q)
\nabla_\theta\log \pi_\theta(o\mid q)
$$

因为：

$$
\pi_\theta(o\mid q)
\nabla_\theta\log \pi_\theta(o\mid q)
=
\nabla_\theta\pi_\theta(o\mid q)
$$

所以：

$$
b(q)\sum_o\nabla_\theta\pi_\theta(o\mid q)
=
b(q)\nabla_\theta\sum_o\pi_\theta(o\mid q)
=
b(q)\nabla_\theta 1
=
0
$$

PPO 中的 critic 本质上就是学习一个低方差 baseline：

$$
b(q,o_{\le t}) \approx V_\phi(q,o_{\le t})
$$

GRPO 的关键取舍是：放弃学习式 critic，改用同一 prompt 下多条采样回答的相对 reward 构造 baseline。

### 2.2 Reasoning 任务适合组内比较

数学、代码、逻辑题通常存在 verifier：

$$
\text{answer correctness}
\quad
\text{format correctness}
\quad
\text{unit-test result}
$$

对于同一个 prompt $q$，旧 policy 采样 $G$ 条回答：

$$
o_1,o_2,\ldots,o_G
\sim
\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
$$

每条回答得到 reward：

$$
r_i=R(q,o_i)
$$

组内比较关注的是：

$$
r_i-\frac{1}{G}\sum_{j=1}^{G}r_j
$$

该量衡量第 $i$ 条回答相对于同题候选集合的表现，能部分抵消题目难度差异。简单题整体 reward 偏高，难题整体 reward 偏低；组内中心化后，训练信号更强调同题内的相对质量。

### 2.3 Reasoning RL 更接近轨迹搜索

reasoning RL 训练的对象是一整条 reasoning trajectory：

$$
q
\rightarrow
y_1,y_2,\ldots,y_T
\rightarrow
r
$$

最终 reward 可能来自答案正确性，也可能来自格式约束、测试结果或 reward model。GRPO 将整条回答视为采样轨迹，并把 response-level reward 传播到这条轨迹的 token logprob 上：

$$
\nabla_\theta \log \pi_\theta(o_i\mid q)
=
\sum_{t=1}^{T_i}
\nabla_\theta
\log \pi_\theta(y_{i,t}\mid q,y_{i,<t})
$$

因此，正 advantage 的回答会提高整条轨迹中 token 的联合概率；负 advantage 的回答会降低对应轨迹的联合概率。

---

## 3. 从 Policy Gradient 到 GRPO

GRPO 的公式可以从 policy gradient、importance sampling 和 PPO clipping 逐步得到。

### 3.1 原始 policy gradient

目标函数为：

$$
J(\theta)
=
\mathbb{E}_{q\sim P(Q)}
\mathbb{E}_{o\sim \pi_\theta(\cdot\mid q)}
\left[
R(q,o)
\right]
$$

梯度为：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}_{q,o\sim\pi_\theta}
\left[
R(q,o)\nabla_\theta\log\pi_\theta(o\mid q)
\right]
$$

加入 baseline 后：

$$
\nabla_\theta J(\theta)
=
\mathbb{E}_{q,o\sim\pi_\theta}
\left[
A(q,o)\nabla_\theta\log\pi_\theta(o\mid q)
\right]
$$

其中：

$$
A(q,o)=R(q,o)-b(q)
$$

### 3.2 用旧 policy 采样时的 importance ratio

实际训练中，样本来自旧 policy：

$$
o\sim\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
$$

为了优化当前 policy $\pi_\theta$，需要 importance ratio：

$$
\rho_\theta(q,o)
=
\frac{
\pi_\theta(o\mid q)
}{
\pi_{\theta_{\mathrm{old}}}(o\mid q)
}
$$

于是 surrogate objective 可以写成：

$$
L^{\mathrm{PG}}(\theta)
=
\mathbb{E}_{q,o\sim\pi_{\theta_{\mathrm{old}}}}
\left[
\rho_\theta(q,o)A(q,o)
\right]
$$

对自回归 LLM：

$$
\rho_\theta(q,o)
=
\prod_{t=1}^{T}
\frac{
\pi_\theta(y_t\mid q,y_{<t})
}{
\pi_{\theta_{\mathrm{old}}}(y_t\mid q,y_{<t})
}
$$

实际实现中也常使用 token-level ratio：

$$
\rho_{i,t}(\theta)
=
\frac{
\pi_\theta(y_{i,t}\mid q,y_{i,<t})
}{
\pi_{\theta_{\mathrm{old}}}(y_{i,t}\mid q,y_{i,<t})
}
$$

再对 token 级 loss 求平均。DeepSeek-R1 论文中的展示公式使用 response-level 写法；工程实现通常会落到 token logprob 上。

### 3.3 PPO clipping

PPO 对 ratio 做裁剪：

$$
L^{\mathrm{CLIP}}(\theta)
=
\mathbb{E}
\left[
\min
\left(
\rho_\theta A,
\operatorname{clip}(\rho_\theta,1-\epsilon,1+\epsilon)A
\right)
\right]
$$

clipping 的作用可按 advantage 符号理解。

当 $A>0$ 时，增大 $\rho_\theta$ 会提高目标值，但超过 $1+\epsilon$ 后被截断：

$$
\rho_\theta A
\le
(1+\epsilon)A
\quad (A>0)
$$

当 $A<0$ 时，过度降低 $\rho_\theta$ 会带来不稳定更新，clip 下界限制为 $1-\epsilon$：

$$
\operatorname{clip}(\rho_\theta,1-\epsilon,1+\epsilon)A
\le
(1-\epsilon)A
\quad (A<0)
$$

因此 clipping 的理论角色是限制新旧 policy 的局部概率比，减少大步 policy update 导致的性能崩塌。

### 3.4 GRPO 的组内 advantage

GRPO 对每个 prompt 采样一组回答：

$$
\{o_i\}_{i=1}^{G}
\sim
\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
$$

reward 记为：

$$
r_i=R(q,o_i)
$$

组内均值和标准差为：

$$
\mu_G
=
\frac{1}{G}\sum_{j=1}^{G}r_j
$$

$$
\sigma_G
=
\sqrt{
\frac{1}{G}
\sum_{j=1}^{G}
(r_j-\mu_G)^2
}
$$

GRPO 使用标准化后的组内相对 advantage：

$$
A_i
=
\frac{r_i-\mu_G}{\sigma_G}
$$

如果 $\sigma_G=0$，组内所有回答 reward 相同，当前 prompt 对该组样本不提供区分信号。实现中通常需要加入数值稳定项：

$$
A_i
=
\frac{r_i-\mu_G}{\sigma_G+\varepsilon_{\mathrm{num}}}
$$

### 3.5 组内均值为什么能当 baseline

理想的 baseline 需要不依赖当前 action。对第 $i$ 个样本，严格的 leave-one-out baseline 可以写成：

$$
b_{-i}
=
\frac{1}{G-1}
\sum_{j\ne i}r_j
$$

由于 $b_{-i}$ 不依赖 $o_i$，它满足 baseline 不改变梯度期望的条件。

GRPO 中常用的组均值：

$$
\mu_G
=
\frac{1}{G}\sum_{j=1}^{G}r_j
$$

包含 $r_i$ 本身。忽略标准差缩放时，中心化梯度项为：

$$
\frac{1}{G}\sum_{i=1}^{G}
(r_i-\mu_G)
\nabla_\theta\log\pi_\theta(o_i\mid q)
$$

考虑同一 prompt 下 $G$ 个独立样本，记：

$$
g_i=\nabla_\theta\log\pi_\theta(o_i\mid q)
$$

则：

$$
\mathbb{E}
\left[
\sum_{i=1}^{G}
(r_i-\mu_G)g_i
\right]
=
\mathbb{E}
\left[
\sum_{i=1}^{G}r_i g_i
-
\frac{1}{G}
\sum_{i=1}^{G}
\sum_{j=1}^{G}
r_j g_i
\right]
$$

当 $j\ne i$ 时，$r_j$ 与 $g_i$ 独立，且：

$$
\mathbb{E}[g_i]
=
\mathbb{E}_{o_i\sim\pi_\theta}
[
\nabla_\theta\log\pi_\theta(o_i\mid q)
]
=0
$$

因此交叉项期望为 $0$。保留下来的同索引项给出：

$$
\mathbb{E}
\left[
\sum_{i=1}^{G}
(r_i-\mu_G)g_i
\right]
=
\left(1-\frac{1}{G}\right)
\mathbb{E}
\left[
\sum_{i=1}^{G}r_i g_i
\right]
$$

这说明，在不考虑标准差缩放时，组均值中心化得到的期望方向与原始 policy gradient 同向，只差一个常数因子 $1-\frac{1}{G}$。标准差归一化会进一步引入自适应缩放，通常降低不同 prompt、不同 reward 尺度带来的训练不稳定，但也会使估计器带有更复杂的样本依赖。

---

## 4. GRPO Objective

DeepSeek-R1 中给出的 GRPO objective 可以写成：

$$
\mathcal{J}_{\mathrm{GRPO}}(\theta)
=
\mathbb{E}
\left[
\frac{1}{G}
\sum_{i=1}^{G}
\left(
\min
\left(
\rho_i(\theta)A_i,
\operatorname{clip}
(\rho_i(\theta),1-\epsilon,1+\epsilon)A_i
\right)
-
\beta
D_{\mathrm{KL}}
(\pi_\theta\parallel \pi_{\mathrm{ref}})
\right)
\right]
$$

其中：

$$
\rho_i(\theta)
=
\frac{
\pi_\theta(o_i\mid q)
}{
\pi_{\theta_{\mathrm{old}}}(o_i\mid q)
}
$$

$$
A_i
=
\frac{
r_i-\operatorname{mean}(\{r_1,\ldots,r_G\})
}{
\operatorname{std}(\{r_1,\ldots,r_G\})
}
$$

$\epsilon$ 控制 PPO-style clipping 范围，$\beta$ 控制 KL 正则强度，$\pi_{\mathrm{ref}}$ 通常是 SFT model 或某个冻结参考模型。

### 4.1 KL 项的估计形式

DeepSeek-R1 中使用的 KL 估计器形式为：

$$
D_{\mathrm{KL}}
(\pi_\theta\parallel\pi_{\mathrm{ref}})
\approx
\frac{
\pi_{\mathrm{ref}}(o_i\mid q)
}{
\pi_\theta(o_i\mid q)
}
-
\log
\frac{
\pi_{\mathrm{ref}}(o_i\mid q)
}{
\pi_\theta(o_i\mid q)
}
-1
$$

令：

$$
x
=
\frac{
\pi_{\mathrm{ref}}(o_i\mid q)
}{
\pi_\theta(o_i\mid q)
}
$$

则该项为：

$$
x-\log x-1
$$

由不等式：

$$
\log x \le x-1
\quad (x>0)
$$

可得：

$$
x-\log x-1\ge 0
$$

当 $x=1$ 时取等号，对应当前 policy 与 reference policy 在该样本上的概率一致。KL 项的作用是抑制 policy 过度偏离 reference，降低 reward hacking 和语言质量退化风险。

### 4.2 Token-level objective

如果把 response-level ratio 展开到 token 级，单条回答 $o_i$ 的 token-level surrogate 可写成：

$$
L_i(\theta)
=
\frac{1}{T_i}
\sum_{t=1}^{T_i}
\min
\left(
\rho_{i,t}(\theta)A_i,
\operatorname{clip}
(\rho_{i,t}(\theta),1-\epsilon,1+\epsilon)A_i
\right)
$$

其中：

$$
\rho_{i,t}(\theta)
=
\frac{
\pi_\theta(y_{i,t}\mid q,y_{i,<t})
}{
\pi_{\theta_{\mathrm{old}}}(y_{i,t}\mid q,y_{i,<t})
}
$$

outcome supervision 下，同一条回答的所有 token 通常共享同一个 response-level advantage：

$$
A_{i,t}=A_i
$$

这对应“整条回答得到一个最终 reward，再把该 reward 信号分配给整条轨迹”的训练方式。

### 4.3 Process supervision 版本

如果 reward model 或 verifier 能给每个 reasoning step 打分，则可以得到 step-level reward：

$$
r_{i,k}
\quad
k=1,\ldots,K_i
$$

设第 $k$ 个 step 覆盖 token 区间：

$$
t\in [e_{i,k-1}+1,e_{i,k}]
$$

对同一 prompt 下所有样本、所有 step reward 做归一化：

$$
A_{i,k}
=
\frac{
r_{i,k}-\mu_{\mathrm{step}}
}{
\sigma_{\mathrm{step}}+\varepsilon_{\mathrm{num}}
}
$$

该 step 内的 token 使用同一个 advantage：

$$
A_{i,t}=A_{i,k},
\quad
t\in [e_{i,k-1}+1,e_{i,k}]
$$

process supervision 的优势是 credit assignment 更细；成本是需要更强的过程奖励模型或更可靠的 step verifier。

---

## 5. Algorithm：一轮 GRPO

一轮 GRPO 可以写成 5 个步骤。

### Step 1：采样 prompt

从任务分布采样 prompt：

$$
q\sim P(Q)
$$

### Step 2：旧 policy 采样一组回答

使用旧 policy 生成 $G$ 条回答：

$$
\{o_1,o_2,\ldots,o_G\}
\sim
\pi_{\theta_{\mathrm{old}}}(\cdot\mid q)
$$

### Step 3：计算 reward

对每条回答打分：

$$
r_i=R(q,o_i)
$$

reward 可以来自：

$$
\text{rule-based verifier}
$$

$$
\text{unit tests}
$$

$$
\text{reward model}
$$

$$
\text{format checker}
$$

### Step 4：计算 group-relative advantage

计算组内均值和标准差：

$$
\mu_G=\frac{1}{G}\sum_{j=1}^{G}r_j
$$

$$
\sigma_G=
\sqrt{
\frac{1}{G}
\sum_{j=1}^{G}(r_j-\mu_G)^2
}
$$

得到：

$$
A_i=\frac{r_i-\mu_G}{\sigma_G+\varepsilon_{\mathrm{num}}}
$$

### Step 5：clipped update + KL regularization

优化：

$$
\frac{1}{G}
\sum_{i=1}^{G}
\min
\left(
\rho_i A_i,
\operatorname{clip}(\rho_i,1-\epsilon,1+\epsilon)A_i
\right)
-
\beta D_{\mathrm{KL}}(\pi_\theta\parallel\pi_{\mathrm{ref}})
$$

其中：

$$
A_i>0
\Rightarrow
\text{increase probability of }o_i
$$

$$
A_i<0
\Rightarrow
\text{decrease probability of }o_i
$$

clip 和 KL 共同限制 update step size。

---

## 6. 和 PPO、DPO 的关系

| 方法 | 优化信号 | 数据来源 | 需要在线 reward? | 需要 critic? | 适合场景 |
| --- | --- | --- | --- | --- | --- |
| PPO | $A_t=R_t-V_\phi(s_t)$ | 在线采样 | 需要 | 通常需要 | 通用 RLHF |
| GRPO | $A_i=(r_i-\mu_G)/\sigma_G$ | 在线组内采样 | 需要 | 不需要 | 数学、代码、可验证 reasoning |
| DPO | chosen / rejected 偏好对 | 离线偏好数据 | 不需要 | 不需要 | 离线偏好对齐 |

PPO 的 advantage 依赖 value model：

$$
A_t^{\mathrm{PPO}}
\approx
R_t-V_\phi(s_t)
$$

GRPO 的 advantage 依赖同题样本组：

$$
A_i^{\mathrm{GRPO}}
=
\frac{r_i-\mu_G}{\sigma_G}
$$

DPO 从偏好对出发，典型训练样本为：

$$
(q,o^+,o^-)
$$

其中 $o^+$ 是 chosen response，$o^-$ 是 rejected response。DPO 目标直接提高 chosen 相对 rejected 的 log-odds：

$$
\log
\frac{
\pi_\theta(o^+\mid q)
}{
\pi_{\mathrm{ref}}(o^+\mid q)
}
-
\log
\frac{
\pi_\theta(o^-\mid q)
}{
\pi_{\mathrm{ref}}(o^-\mid q)
}
$$

GRPO 更接近在线采样版的相对优化：每轮由当前或旧 policy 生成候选答案，再通过 reward / verifier 转成组内相对 advantage。DPO 更接近离线 preference classification-style objective。

---

## 7. 七个元维度

### 维度 1：优化对象

LLM completion 是 trajectory：

$$
o=(y_1,y_2,\ldots,y_T)
$$

policy 为：

$$
\pi_\theta(o\mid q)
=
\prod_{t=1}^{T}
\pi_\theta(y_t\mid q,y_{<t})
$$

GRPO 的 reward 通常在 response-level 给出，但梯度落到 token-level logprob：

$$
\nabla_\theta\log\pi_\theta(o\mid q)
=
\sum_{t=1}^{T}
\nabla_\theta
\log\pi_\theta(y_t\mid q,y_{<t})
$$

因此，优化对象可以理解为 response-level trajectory，参数更新作用在 token-level policy 上。

### 维度 2：reward 来源

GRPO 不限定 reward 形式。常见 reward 包括：

$$
\text{accuracy reward}
$$

$$
\text{format reward}
$$

$$
\text{unit-test reward}
$$

$$
\text{reward-model score}
$$

可验证任务中，rule-based reward 通常更稳定；开放式任务中，reward model 更常见，但也更容易出现 reward hacking。

### 维度 3：baseline 构造

PPO baseline：

$$
V_\phi(q,o_{\le t})
$$

GRPO baseline：

$$
\mu_G=\frac{1}{G}\sum_{j=1}^{G}r_j
$$

关键假设为：

$$
\text{same prompt}
\Rightarrow
\text{same difficulty context}
$$

在同一 prompt 内比较，题目难度作为共享因素被部分抵消。

### 维度 4：方差与偏差

group size $G$ 决定组内 baseline 的稳定性。

当 $G$ 较小时：

$$
\mu_G
\text{ has high variance}
$$

当 reward 全部相同时：

$$
r_1=r_2=\cdots=r_G
\Rightarrow
\sigma_G=0
$$

此时 group-relative advantage 无法提供排序信号。

标准差归一化的作用是尺度控制：

$$
r_i-\mu_G
\quad\Longrightarrow\quad
\frac{r_i-\mu_G}{\sigma_G+\varepsilon_{\mathrm{num}}}
$$

尺度控制能缓解不同 prompt 的 reward scale 差异，但样本标准差本身也依赖当前组样本，因此会引入额外估计噪声。

### 维度 5：policy update 稳定性

稳定性由三个量控制：

$$
\rho_\theta
=
\frac{\pi_\theta}{\pi_{\theta_{\mathrm{old}}}}
$$

$$
\epsilon
\quad
\text{for clipping}
$$

$$
\beta
\quad
\text{for KL regularization}
$$

$\epsilon$ 控制局部更新半径；$\beta$ 控制 reference policy 对当前 policy 的牵引强度。$\epsilon$ 或 $\beta$ 过松，reward hacking 风险上升；过紧则 policy 学习信号不足。

### 维度 6：任务适配性

GRPO 特别适合 reward 清晰、可验证的任务：

$$
\text{math}
\quad
\text{code}
\quad
\text{logic}
\quad
\text{structured output}
$$

这些任务具备明确的 verifier 或近似 verifier。开放式写作、审美判断、复杂人类偏好任务中的 reward 更难稳定定义，GRPO 的效果更依赖 reward model 质量。

### 维度 7：系统成本

GRPO 的工程收益来自 critic 的移除：

$$
\text{PPO}
=
\text{policy}
+
\text{reference}
+
\text{reward}
+
\text{critic}
$$

$$
\text{GRPO}
=
\text{policy}
+
\text{reference}
+
\text{reward / verifier}
$$

对应收益包括：

$$
\text{less model memory}
$$

$$
\text{no value training}
$$

$$
\text{simpler RL pipeline}
$$

$$
\text{better scalability for reasoning RL}
$$

---

## 8. 最小理解骨架

GRPO 的最小公式骨架为：

$$
q
\rightarrow
\{o_1,\ldots,o_G\}
$$

$$
o_i
\rightarrow
r_i
$$

$$
r_i
\rightarrow
A_i
=
\frac{
r_i-\mu_G
}{
\sigma_G+\varepsilon_{\mathrm{num}}
}
$$

$$
A_i>0
\Rightarrow
\uparrow \log\pi_\theta(o_i\mid q)
$$

$$
A_i<0
\Rightarrow
\downarrow \log\pi_\theta(o_i\mid q)
$$

$$
\text{clipping}
+
\text{KL}
\Rightarrow
\text{stable update}
$$

压缩成一句：

> **GRPO 用同题多答案的组内相对好坏替代 PPO 的 critic baseline，使 LLM reasoning RL 在保留在线 policy optimization 的同时降低系统成本。**

---

## References

- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models][deepseekmath]
- [Proximal Policy Optimization Algorithms][ppo]
- [DeepSeek-R1 incentivizes reasoning in LLMs through reinforcement learning][deepseek-r1]
- [Hugging Face TRL: GRPO Trainer][trl-grpo]

[deepseekmath]: https://arxiv.org/html/2402.03300v3
[ppo]: https://arxiv.org/abs/1707.06347
[deepseek-r1]: https://www.nature.com/articles/s41586-025-09422-z
[trl-grpo]: https://huggingface.co/docs/trl/grpo_trainer

---

## 下载

[下载 GRPO 教材 PDF](/pdf/grpo-textbook.pdf)
