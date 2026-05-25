---
title: 'Softmax 的几何本质：从相对优势到概率单纯形'
description: '从平移不变性、log-odds、log-sum-exp、最大熵优化和 Jacobian 出发，看 softmax 如何把 logit 的相对结构变成注意力中的概率竞争。'
publishDate: '2026-05-24'
tags: ['LLM', 'Transformer', 'Attention', 'Softmax', '机制分析']
language: 'zh-CN'
draft: false
---

# Softmax 的几何本质

Transformer 的注意力机制通常会先写成一个加权平均：

$$
y_t=\sum_i a_{ti}v_i.
$$

但这个式子只写出了最后的读出步骤。信息从哪里来，取决于注意力权重 $a_{ti}$ 怎样生成。

在一个 attention head 中，模型先计算 query 与 key 的匹配分数：

$$
z_{ti}
=
\frac{q_t^\top k_i}{\sqrt{d_k}}+m_{ti},
$$

其中 $q_t$ 是当前位置的 query，$k_i$ 是上下文位置 $i$ 的 key，$m_{ti}$ 是 mask，$z_{ti}$ 是 attention logit。

随后，Transformer 用 softmax 将 logits 转成概率分布：

$$
a_{ti}
=
\frac{\exp(z_{ti}/\tau)}
{\sum_j\exp(z_{tj}/\tau)}.
$$

最后，模型通过 $y_t=\sum_i a_{ti}v_i$ 完成信息聚合。

于是，attention 的计算链条可以写成：

$$
Q,K
\longrightarrow
Z=\frac{QK^\top}{\sqrt{d_k}}+M
\longrightarrow
A=\operatorname{softmax}(Z/\tau)
\longrightarrow
Y=AV.
$$

上一篇讨论了 attention 熵如何刻画信息路由宽度。这里先放下“低熵路由”和“隧道视野”，转向 softmax 本身：

> softmax 究竟把 logit 空间里的哪些结构，变成了概率单纯形上的竞争结构？

可以先把结论放在这里：

> softmax 除了完成归一化，还会把 logit 之间的相对优势改写成概率单纯形上的竞争关系。

---

## 1. Softmax 把实向量映射到概率单纯形

给定 logits：

$$
z=[z_1,z_2,\dots,z_n]\in\mathbb{R}^n,
$$

softmax 定义为：

$$
p_i
=
\frac{\exp(z_i)}
{\sum_{j=1}^{n}\exp(z_j)}.
$$

输出 $p=[p_1,\dots,p_n]$ 满足：

$$
p_i>0,
\qquad
\sum_i p_i=1.
$$

也就是说，softmax 会把 $\mathbb{R}^n$ 中的实向量映射到概率单纯形内部：

$$
\Delta^{n-1}_{\mathrm{int}}
=
\left\{
p\in\mathbb{R}^{n}
:
p_i>0,\
\sum_i p_i=1
\right\}.
$$

这个视角能把问题说清楚。logits 位于无约束空间，probabilities 则被限制在一个有约束的几何对象上。softmax 做的事，是把一组自由的竞争分数落到单纯形中的一个点。

在 $n=3$ 时，概率单纯形是一个三角形。三个顶点分别表示：

$$
[1,0,0],
\qquad
[0,1,0],
\qquad
[0,0,1].
$$

三角形中心表示均匀分布：

$$
\left[\frac{1}{3},\frac{1}{3},\frac{1}{3}\right].
$$

可以把 softmax 的几何作用理解为：logit 向量决定这个点在单纯形里靠近哪个顶点、离中心多远、沿哪条竞争方向移动。

---

## 2. 它关心相对差值，整体平移会消失

softmax 看起来像在比较 logits 的绝对大小，实际进入概率比值的是相对差值。

对所有 logits 同时加上常数 $c$：

$$
z_i'=z_i+c.
$$

新的 softmax 为：

$$
p_i'
=
\frac{\exp(z_i+c)}
{\sum_j\exp(z_j+c)}
=
\frac{\exp(c)\exp(z_i)}
{\exp(c)\sum_j\exp(z_j)}
=
p_i.
$$

因此：

$$
\operatorname{softmax}(z+c\mathbf{1})
=
\operatorname{softmax}(z).
$$

所以 softmax 对整体平移不敏感。它丢掉了 $\mathbf{1}=[1,\dots,1]$ 这个方向，只保留垂直于 $\mathbf{1}$ 的差值结构。

用几何语言说，softmax 作用在去掉整体平移方向后的商空间：

$$
\mathbb{R}^n / \operatorname{span}\{\mathbf{1}\}.
$$

也可以把 logits 先中心化：

$$
\tilde z_i
=
z_i-\frac{1}{n}\sum_j z_j.
$$

由于平移不变性：

$$
\operatorname{softmax}(z)
=
\operatorname{softmax}(\tilde z).
$$

所以 $[1,2,3]$ 和 $[101,102,103]$ 会产生完全一样的概率分布，因为它们具有相同的内部间隔结构。

回到 attention，单个 $z_{ti}$ 的绝对数值不能单独决定权重；权重由位置之间的差值决定：

$$
z_{ti}-z_{tj}.
$$

也就是位置 $i$ 相比位置 $j$ 有多少相对优势。

---

## 3. Log-odds：softmax 精确保留相对优势

理解 softmax 最直接的方式，是看概率比值。

对任意两个位置 $i,j$：

$$
\frac{p_i}{p_j}
=
\frac{\exp(z_i)}
{\exp(z_j)}
=
\exp(z_i-z_j).
$$

取对数得到：

$$
\log\frac{p_i}{p_j}
=
z_i-z_j.
$$

这条式子给出了 softmax 的主要关系：

> logit 差值就是概率比值的对数。

带温度时：

$$
p_i
=
\frac{\exp(z_i/\tau)}
{\sum_j\exp(z_j/\tau)},
$$

于是：

$$
\log\frac{p_i}{p_j}
=
\frac{z_i-z_j}{\tau}.
$$

温度 $\tau$ 缩放的是所有 log-odds。

放到 attention 里：

$$
\log\frac{a_{ti}}{a_{tj}}
=
\frac{
z_{ti}-z_{tj}
}{\tau}.
$$

如果忽略 mask 差异，则：

$$
z_{ti}-z_{tj}
=
\frac{
q_t^\top(k_i-k_j)
}{
\sqrt{d_k}
}.
$$

所以：

$$
\log\frac{a_{ti}}{a_{tj}}
=
\frac{
q_t^\top(k_i-k_j)
}{
\sqrt{d_k}\tau
}.
$$

这给出了一个更具体的解释：attention 的竞争可以写成“query 沿着 $k_i-k_j$ 这个差分方向，更偏向谁”。

换句话说，softmax 把 key 之间的相对几何差异，变成了读取概率之间的 log-odds。

---

## 4. 二分类截面：sigmoid 是 softmax 的一条线

二分类时，logits 为 $z_1,z_2$。令：

$$
\Delta=z_1-z_2.
$$

则：

$$
p_1
=
\frac{\exp(z_1)}
{\exp(z_1)+\exp(z_2)}
=
\frac{1}{1+\exp(-\Delta)}.
$$

这正是 sigmoid：

$$
p_1=\sigma(\Delta),
\qquad
p_2=1-p_1.
$$

所以 sigmoid 可以看成 softmax 在二维概率单纯形上的截面。二维单纯形只是一条线段：

$$
[1,0]\quad\longleftrightarrow\quad[0,1].
$$

当 $\Delta=0$ 时：

$$
p_1=p_2=\frac{1}{2}.
$$

当 $\Delta\to+\infty$ 时：

$$
p_1\to 1,\qquad p_2\to 0.
$$

当 $\Delta\to-\infty$ 时：

$$
p_1\to 0,\qquad p_2\to 1.
$$

因此，多分类 softmax 可以看成很多个 pairwise log-odds 关系一起成立。每一对类别都由一个 logit 差值控制，但这些概率又必须共同落在同一个单纯形里。

---

## 5. Log-sum-exp：softmax 是平滑最大值的梯度

softmax 还有一个常用而有力的来源：它是 log-sum-exp 函数的梯度。

定义带温度的 log-sum-exp：

$$
\operatorname{LSE}_{\tau}(z)
=
\tau\log\sum_i\exp(z_i/\tau).
$$

对 $z_i$ 求偏导：

$$
\frac{\partial}{\partial z_i}
\operatorname{LSE}_{\tau}(z)
=
\frac{\exp(z_i/\tau)}
{\sum_j\exp(z_j/\tau)}
=
p_i.
$$

因此：

$$
\nabla_z\operatorname{LSE}_{\tau}(z)
=
\operatorname{softmax}(z/\tau).
$$

所以 softmax 来自一个凸势函数的梯度映射。

而 log-sum-exp 本身是最大值函数的平滑版本：

$$
\max_i z_i
\le
\operatorname{LSE}_{\tau}(z)
\le
\max_i z_i+\tau\log n.
$$

当 $\tau\to 0$ 时：

$$
\operatorname{LSE}_{\tau}(z)
\to
\max_i z_i.
$$

对应地：

$$
\operatorname{softmax}(z/\tau)
\to
\operatorname{onehot}(\arg\max_i z_i),
$$

如果最大值唯一。

因此，softmax 也可以写成：

> hardmax 的可微版本，或者平滑最大值的梯度。

这也解释了它为什么会有“赢家变强”的趋势：log-sum-exp 在逼近最大值，而 softmax 是这个平滑最大值对每个 logit 的敏感度。

---

## 6. 最大熵视角：softmax 是一个优化问题的解

softmax 还可以从最大熵优化中推出。

给定 logits $z$，考虑在概率单纯形上选择一个分布 $p$，使得高分位置获得更大权重，但又不完全塌缩到单点：

$$
\max_{p\in\Delta^{n-1}}
\left\{
\sum_i p_i z_i
+
\tau H(p)
\right\},
$$

其中：

$$
H(p)
=
-
\sum_i p_i\log p_i.
$$

第一项 $\sum_i p_i z_i$ 鼓励把概率质量放到高 logit 上，第二项 $\tau H(p)$ 鼓励分布保持熵。

写成拉格朗日函数：

$$
\mathcal{L}(p,\lambda)
=
\sum_i p_i z_i
-
\tau\sum_i p_i\log p_i
+
\lambda\left(\sum_i p_i-1\right).
$$

对 $p_i$ 求导并令其为 $0$：

$$
z_i-\tau(\log p_i+1)+\lambda=0.
$$

整理得到：

$$
\log p_i
=
\frac{z_i}{\tau}
+
\frac{\lambda-\tau}{\tau}.
$$

因此：

$$
p_i
\propto
\exp(z_i/\tau).
$$

归一化后：

$$
p_i
=
\frac{\exp(z_i/\tau)}
{\sum_j\exp(z_j/\tau)}.
$$

这正是 softmax。

这个推导给出一个有用的解释：

> softmax 是“偏向高分”与“保持熵”之间的最优折中。

温度 $\tau$ 控制这个折中。$\tau$ 越大，熵项占比越高，分布越接近均匀；$\tau$ 越小，分数项占比越高，分布越接近 argmax。

相比“softmax 会让分布变尖锐”，熵正则化选择问题给出了更完整的说法。softmax 在高分偏好和熵之间求解折中。

---

## 7. 温度是 logit 空间的径向缩放

由于 softmax 对整体平移不敏感，可以先把 logits 中心化为 $\tilde z$。带温度的 softmax 等价于：

$$
\operatorname{softmax}(z/\tau)
=
\operatorname{softmax}(\tilde z/\tau).
$$

也就是说，温度只作用在中心化后的差值空间里。

从几何上看，$\tau$ 改变的是 $\tilde z$ 离原点的距离：

$$
\left\|\frac{\tilde z}{\tau}\right\|
=
\frac{1}{\tau}
\|\tilde z\|.
$$

当 $\tau\to\infty$ 时：

$$
\frac{\tilde z}{\tau}\to 0,
$$

softmax 输出趋近单纯形中心：

$$
p_i\to \frac{1}{n}.
$$

当 $\tau\to 0$ 时，$\tilde z/\tau$ 沿着同一个方向被拉得很远，softmax 输出趋近某个顶点。

因此，温度保留“谁比谁大”的排序，同时改变竞争方向上的强度。它控制的是从单纯形中心走向顶点的距离。

这也解释了为什么温度调节常常能显著改变生成行为：它在 logit 差值空间里放大或压缩所有竞争关系；单纯的概率线性缩放描述不了这种变化。

---

## 8. Jacobian：softmax 的梯度是一个协方差矩阵

softmax 的 Jacobian 为：

$$
\frac{\partial p_i}{\partial z_j}
=
\frac{1}{\tau}
p_i(\mathbb{I}[i=j]-p_j).
$$

写成矩阵形式：

$$
J
=
\frac{1}{\tau}
\left(
\operatorname{Diag}(p)-pp^\top
\right).
$$

这个矩阵有一个直接的解释：它是 categorical distribution 的协方差矩阵。

如果随机变量 $e_i$ 以概率 $p_i$ 取第 $i$ 个 one-hot 向量，那么：

$$
\operatorname{Cov}(e)
=
\operatorname{Diag}(p)-pp^\top.
$$

因此：

$$
J
=
\frac{1}{\tau}\operatorname{Cov}(e).
$$

对任意方向 $u\in\mathbb{R}^n$：

$$
u^\top J u
=
\frac{1}{\tau}
\left(
\sum_i p_i u_i^2
-
\left(\sum_i p_i u_i\right)^2
\right)
=
\frac{1}{\tau}
\operatorname{Var}_{i\sim p}(u_i).
$$

也就是说，softmax 的局部敏感度，等于某个方向在当前概率分布下的方差。

这里有两个直接结论。

第一，整体平移方向没有梯度：

$$
J\mathbf{1}=0.
$$

因为给所有 logits 加同一个常数不会改变 softmax。

第二，当分布接近某个顶点时，协方差会变小。若：

$$
p_r\approx 1,
\qquad
p_i\approx 0\quad(i\ne r),
$$

则：

$$
J\approx 0.
$$

这对应 softmax 饱和。靠近单纯形顶点时，可重新分配的概率质量已经很少。

---

## 9. 数值稳定性来自平移不变性

实际计算 softmax 时，通常不会直接写：

$$
p_i
=
\frac{\exp(z_i)}
{\sum_j\exp(z_j)}.
$$

因为当 $z_i$ 很大时，$\exp(z_i)$ 可能溢出。

稳定写法是先减去最大值：

$$
p_i
=
\frac{\exp(z_i-\max_j z_j)}
{\sum_k\exp(z_k-\max_j z_j)}.
$$

这个写法和原式完全等价：

$$
\operatorname{softmax}(z)
=
\operatorname{softmax}(z-\max_j z_j\cdot\mathbf{1}).
$$

原因正是前面的平移不变性。减去最大值只是选了一个更稳定的代表元，让所有指数项都不超过 $1$：

$$
z_i-\max_j z_j\le 0.
$$

所以，稳定 softmax 的做法是：在同一个等价类 $z+c\mathbf{1}$ 里，选择一个不会数值溢出的代表元。

---

## 10. 放回 Attention：query 在比较 key 的差分方向

现在把 softmax 的几何性质放回 attention。

对固定目标位置 $t$，attention logits 为：

$$
z_{ti}
=
\frac{q_t^\top k_i}{\sqrt{d_k}}+m_{ti}.
$$

两个候选位置 $i,j$ 的 logit 差值是：

$$
z_{ti}-z_{tj}
=
\frac{
q_t^\top(k_i-k_j)
}{
\sqrt{d_k}
}
+
(m_{ti}-m_{tj}).
$$

如果 $i,j$ 都没有被 mask，则：

$$
z_{ti}-z_{tj}
=
\frac{
q_t^\top(k_i-k_j)
}{
\sqrt{d_k}
}.
$$

对应的 attention 权重比为：

$$
\frac{a_{ti}}{a_{tj}}
=
\exp\left(
\frac{
q_t^\top(k_i-k_j)
}{
\sqrt{d_k}\tau
}
\right).
$$

这个公式比“query 和 key 相似度越高，注意力越大”更精确。它说明：

> query 会在所有 key 的差分方向上做竞争判断。

位置 $i$ 是否获得更多注意力，同时取决于 $q_t^\top k_i$ 和它相对其他 key 的优势。

因此，softmax 给 attention 带来三层机制：

1. 把每一行 logits 投影到相对差值空间；
2. 把 logit 差值转成概率 log-odds；
3. 在概率单纯形上选择一个熵正则化的竞争分布。

---

## 总结

softmax 可以从几条互相一致的线索来理解。

第一，它是从无约束 logit 空间到概率单纯形内部的映射：

$$
\mathbb{R}^n
\longrightarrow
\Delta^{n-1}_{\mathrm{int}}.
$$

第二，它对整体平移不敏感，使用的是相对差值：

$$
\operatorname{softmax}(z+c\mathbf{1})
=
\operatorname{softmax}(z).
$$

第三，它精确保留 logit 差值与概率比值之间的关系：

$$
\log\frac{p_i}{p_j}
=
\frac{z_i-z_j}{\tau}.
$$

第四，它是 log-sum-exp 的梯度：

$$
\nabla_z\operatorname{LSE}_{\tau}(z)
=
\operatorname{softmax}(z/\tau).
$$

第五，它是熵正则化选择问题的最优解：

$$
\operatorname{softmax}(z/\tau)
=
\arg\max_{p\in\Delta^{n-1}}
\left\{
\langle p,z\rangle+\tau H(p)
\right\}.
$$

放回 Transformer，attention 中的 softmax 会把分数归一化为权重，也会把 query-key 产生的相对几何优势转换成单纯形上的概率竞争结构。

一句短的说法是：

$$
\text{softmax makes scores sum to one}.
$$

更完整的说法是：

$$
\text{softmax turns relative logit geometry into probabilistic competition}.
$$

这概括了 softmax 在 attention 中承担的几何角色。
