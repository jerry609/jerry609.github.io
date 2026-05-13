---
title: '高斯策略'
description: '从高斯分布、归一化常数和最大熵原理出发，推导连续动作空间里的高斯策略公式。'
publishDate: '2026-05-13'
tags: ['强化学习', '概率论', '高斯分布', '最大熵', '连续控制']
language: 'zh-CN'
draft: false
---

# 高斯策略

连续动作策略里常见的公式是：

$$
\pi_\theta(a\mid s)
=
\frac{1}{\sigma_\theta(s)\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu_\theta(s))^2}{2\sigma_\theta(s)^2}
\right)
$$

它有两层含义。

第一层：这是一个高斯分布的概率密度函数。

第二层：在连续动作空间里，如果只知道动作的均值和方差，并希望分布熵最大，数学会推出这个形状。

---

## 0. 公式成立前的假设

这个公式出现之前，已经默认了几件事。

### 假设 1：动作是连续变量

方向盘角度、机械臂关节角度、力度、速度，都可以看成连续动作：

$$
a\in\mathbb{R}
$$

如果动作只能取“左、右、上、下”，通常会用 categorical distribution。连续动作更适合用连续概率密度建模，高斯分布就是最常见的一种选择。

### 假设 2：给定状态后，动作服从高斯分布

给定状态 $s$，动作满足：

$$
a\mid s \sim \mathcal{N}\bigl(\mu_\theta(s),\sigma_\theta(s)^2\bigr)
$$

这句话的意思是：策略网络读入状态 $s$，输出两个量：

$$
\mu_\theta(s)
$$

和

$$
\sigma_\theta(s)
$$

其中，$\mu_\theta(s)$ 表示动作分布的中心，也就是“平均想做什么动作”；$\sigma_\theta(s)$ 表示动作分布的宽度，也就是“愿意探索多大范围”。

因此 $\pi_\theta(a\mid s)$ 是一个状态条件分布：在状态 $s$ 下，策略选择动作 $a$ 的概率密度。

### 假设 3：标准差必须大于 0

标准差表示宽度，所以必须满足：

$$
\sigma_\theta(s)>0
$$

真实代码里，神经网络通常输出 $\log\sigma_\theta(s)$，再取指数：

$$
\sigma_\theta(s)=\exp(\log\sigma_\theta(s))
$$

这样可以保证标准差始终为正。

### 假设 4：动作空间先看作整个实数轴

标准高斯公式默认：

$$
a\in(-\infty,\infty)
$$

如果真实动作有范围，例如 $a\in[-1,1]$，SAC 里常用的做法是先采样：

$$
u\sim \mathcal{N}\bigl(\mu_\theta(s),\sigma_\theta(s)^2\bigr)
$$

再压缩：

$$
a=\tanh(u)
$$

这叫 **tanh-squashed Gaussian policy**。这时概率密度还需要额外的 Jacobian 修正。本文先看最基础的未压缩版本。

---

## 1. 从普通高斯分布开始

先不考虑神经网络，也不考虑状态 $s$。只看一个连续随机变量 $a$。

假设分布中心是 $\mu$，波动尺度是 $\sigma$。我们希望它满足三个性质：

1. 离 $\mu$ 越近，概率越大。
2. 离 $\mu$ 越远，概率越小。
3. 左右对称，只关心偏离距离。

于是先写成：

$$
p(a)=C\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
$$

指数部分

$$
\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
$$

负责制造钟形曲线。前面的常数 $C$ 负责让总概率等于 $1$。

概率密度必须满足：

$$
\int_{-\infty}^{\infty}p(a)\,da=1
$$

代入 $p(a)$：

$$
\int_{-\infty}^{\infty}
C\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
\,da
=
1
$$

把常数 $C$ 提出来：

$$
C
\int_{-\infty}^{\infty}
\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
\,da
=
1
$$

做变量替换：

$$
z=\frac{a-\mu}{\sigma}
$$

于是：

$$
a=\mu+\sigma z,
\qquad
da=\sigma\,dz
$$

积分变成：

$$
C\sigma
\int_{-\infty}^{\infty}
\exp\left(-\frac{z^2}{2}\right)
\,dz
=
1
$$

经典高斯积分给出：

$$
\int_{-\infty}^{\infty}
\exp\left(-\frac{z^2}{2}\right)
\,dz
=
\sqrt{2\pi}
$$

所以：

$$
C\sigma\sqrt{2\pi}=1
$$

因此：

$$
C=\frac{1}{\sigma\sqrt{2\pi}}
$$

带回原式：

$$
p(a)
=
\frac{1}{\sigma\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu)^2}{2\sigma^2}
\right)
$$

这就是一维高斯分布的概率密度函数。

---

## 2. 为什么有平方项

平方项来自对称性。

我们希望：

$$
a=\mu+c
$$

和

$$
a=\mu-c
$$

具有相同概率。向左偏离 $c$ 和向右偏离 $c$，应该一样可能。

所以概率密度依赖偏离量的平方：

$$
(a-\mu)^2
$$

因为：

$$
(\mu+c-\mu)^2=c^2
$$

并且：

$$
(\mu-c-\mu)^2=(-c)^2=c^2
$$

平方把左右偏差统一成同一个距离量。高斯分布因此天然以 $\mu$ 为中心对称。

---

## 3. 为什么指数前面有负号

如果指数项随着距离变大而增长，曲线下面积会发散，无法成为概率分布。

负号让概率密度随着偏离增大而下降：

$$
\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
$$

当 $|a-\mu|$ 越大，指数里的负数越小，概率密度越低。

---

## 4. 为什么分母是 $2\sigma^2$

把高斯写成更一般的形式：

$$
p(a)=C\exp\bigl(-\beta(a-\mu)^2\bigr)
$$

其中 $\beta$ 控制曲线宽度。$\beta$ 越大，曲线下降越快，分布越窄；$\beta$ 越小，曲线下降越慢，分布越宽。

可以计算得到，这个分布的方差是：

$$
\operatorname{Var}(a)=\frac{1}{2\beta}
$$

我们希望方差正好等于 $\sigma^2$，于是令：

$$
\frac{1}{2\beta}=\sigma^2
$$

解得：

$$
\beta=\frac{1}{2\sigma^2}
$$

所以指数写成：

$$
-\frac{(a-\mu)^2}{2\sigma^2}
$$

这样参数 $\sigma^2$ 才真的是这个分布的方差。

---

## 5. 最大熵原理推出高斯形状

上面从高斯形状开始推导归一化常数。现在换一个角度：为什么会出现这个形状？

最大熵问题是：在所有概率密度 $p(a)$ 中，找熵最大的分布。

连续分布的 Shannon differential entropy 是：

$$
H(p)
=
-\int p(a)\log p(a)\,da
$$

约束有三个：

$$
\int p(a)\,da=1
$$

$$
\int a p(a)\,da=\mu
$$

$$
\int (a-\mu)^2p(a)\,da=\sigma^2
$$

也就是概率总量为 $1$，均值固定为 $\mu$，方差固定为 $\sigma^2$。

构造拉格朗日泛函：

$$
\mathcal{L}[p]
=
-\int p(a)\log p(a)\,da
+
\lambda_0
\left(
\int p(a)\,da-1
\right)
$$

$$
+
\lambda_1
\left(
\int (a-\mu)p(a)\,da
\right)
+
\lambda_2
\left(
\int (a-\mu)^2p(a)\,da-\sigma^2
\right)
$$

对 $p(a)$ 做变分。核心求导是：

$$
\frac{\delta}{\delta p(a)}
\left[
-p(a)\log p(a)
\right]
=
-\log p(a)-1
$$

因此：

$$
\frac{\delta \mathcal{L}}{\delta p(a)}
=
-\log p(a)-1
+
\lambda_0
+
\lambda_1(a-\mu)
+
\lambda_2(a-\mu)^2
$$

令它等于 $0$：

$$
-\log p(a)-1
+
\lambda_0
+
\lambda_1(a-\mu)
+
\lambda_2(a-\mu)^2
=
0
$$

移项：

$$
\log p(a)
=
\lambda_0-1
+
\lambda_1(a-\mu)
+
\lambda_2(a-\mu)^2
$$

两边取指数：

$$
p(a)
=
\exp(\lambda_0-1)
\exp(\lambda_1(a-\mu))
\exp(\lambda_2(a-\mu)^2)
$$

由于约束只固定均值和方差，没有额外规定左右偏向，最大熵解以 $\mu$ 为中心对称。因此线性项消失：

$$
\lambda_1=0
$$

于是：

$$
p(a)
=
\exp(\lambda_0-1)
\exp(\lambda_2(a-\mu)^2)
$$

记：

$$
C=\exp(\lambda_0-1)
$$

得到：

$$
p(a)=C\exp(\lambda_2(a-\mu)^2)
$$

为了让积分收敛，必须有：

$$
\lambda_2<0
$$

令：

$$
\lambda_2=-\beta,
\qquad
\beta>0
$$

于是：

$$
p(a)=C\exp\bigl(-\beta(a-\mu)^2\bigr)
$$

根据方差约束：

$$
\beta=\frac{1}{2\sigma^2}
$$

所以：

$$
p(a)=C\exp\left(-\frac{(a-\mu)^2}{2\sigma^2}\right)
$$

再由归一化条件解出：

$$
C=\frac{1}{\sigma\sqrt{2\pi}}
$$

最终：

$$
p(a)
=
\frac{1}{\sigma\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu)^2}{2\sigma^2}
\right)
$$

这说明：在只知道均值和方差的情况下，熵最大的连续分布就是高斯分布。

---

## 6. 回到强化学习策略

强化学习里的策略写作：

$$
\pi_\theta(a\mid s)
$$

它表示：在状态 $s$ 下，智能体选择动作 $a$ 的概率密度。

把普通高斯分布里的 $\mu$ 和 $\sigma$ 换成神经网络输出：

$$
\mu \rightarrow \mu_\theta(s)
$$

$$
\sigma \rightarrow \sigma_\theta(s)
$$

就得到：

$$
\pi_\theta(a\mid s)
=
\frac{1}{\sigma_\theta(s)\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu_\theta(s))^2}{2\sigma_\theta(s)^2}
\right)
$$

其中：

$$
\mu_\theta(s)
$$

控制动作分布的中心。

$$
\sigma_\theta(s)
$$

控制动作分布的宽度。

$$
a-\mu_\theta(s)
$$

表示当前动作偏离策略均值多少。

$$
(a-\mu_\theta(s))^2
$$

表示偏离程度。

$$
\exp\left(
-\frac{(a-\mu_\theta(s))^2}{2\sigma_\theta(s)^2}
\right)
$$

表示偏离越大，概率越低。

$$
\frac{1}{\sigma_\theta(s)\sqrt{2\pi}}
$$

保证整条概率密度曲线下面积等于 $1$。

---

## 7. 核心直觉

高斯策略可以写成采样形式：

$$
a
=
\mu_\theta(s)
+
\sigma_\theta(s)\epsilon
$$

其中：

$$
\epsilon\sim\mathcal{N}(0,1)
$$

也就是说：

$$
\text{动作}
=
\text{当前最想做的动作}
+
\text{随机探索噪声}
$$

如果 $\sigma_\theta(s)$ 很大，动作更分散，探索更强。

如果 $\sigma_\theta(s)$ 很小，动作更集中，策略更确定。

所以高斯策略把连续控制问题拆成两个输出：

$$
\mu_\theta(s):\text{当前倾向于做什么}
$$

$$
\sigma_\theta(s):\text{愿意探索多大范围}
$$

---

## 8. 总结

这个公式的前提是：

$$
a\in\mathbb{R}
$$

$$
a\mid s\sim \mathcal{N}\bigl(\mu_\theta(s),\sigma_\theta(s)^2\bigr)
$$

$$
\sigma_\theta(s)>0
$$

从最大熵角度看，还需要约束：

$$
\int p(a)\,da=1
$$

$$
\int a p(a)\,da=\mu
$$

$$
\int (a-\mu)^2p(a)\,da=\sigma^2
$$

在这些约束下，最大熵原理推出：

$$
p(a)
=
\frac{1}{\sigma\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu)^2}{2\sigma^2}
\right)
$$

把 $\mu$ 和 $\sigma$ 换成状态相关的神经网络输出 $\mu_\theta(s)$、$\sigma_\theta(s)$，就得到强化学习里的高斯策略：

$$
\pi_\theta(a\mid s)
=
\frac{1}{\sigma_\theta(s)\sqrt{2\pi}}
\exp\left(
-\frac{(a-\mu_\theta(s))^2}{2\sigma_\theta(s)^2}
\right)
$$

一句话：动作是连续的；只知道均值和方差时，熵最大的分布是高斯分布。高斯策略就是把这个最大熵分布做成状态相关的策略网络输出。
