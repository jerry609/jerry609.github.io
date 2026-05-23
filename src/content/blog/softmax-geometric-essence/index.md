---
title: 'Softmax 的几何本质：从相对优势到概率单纯形'
description: '从平移不变性、log-odds、log-sum-exp、最大熵优化和 Jacobian 几何出发，解释 softmax 如何把 logit 结构变成注意力竞争。'
publishDate: '2026-05-24'
tags: ['LLM', 'Transformer', 'Attention', 'Softmax', '机制分析']
language: 'zh-CN'
draft: false
---

# Softmax 的几何本质

Transformer 的注意力机制表面上是在做加权平均：

$$
y_t=\sum_i a_{ti}v_i.
$$

但真正控制信息流向的核心，并不是 value 向量本身，而是注意力权重 $a_{ti}$ 如何生成。

在一个 attention head 中，模型先计算 query 与 key 的匹配分数：

$$
z_{ti}
=
\frac{q_t^\top k_i}{\sqrt{d_k}}+m_{ti},
$$

其中 $q_t$ 是当前位置的 query，$k_i$ 是上下文位置 $i$ 的 key，$m_{ti}$ 是 mask，$z_{ti}$ 是 attention logit。

随后，Transformer 使用 softmax 将 logits 转化成概率分布：

$$
a_{ti}
=
\frac{\exp(z_{ti}/\tau)}
{\sum_j\exp(z_{tj}/\tau)}.
$$

最终，模型通过 $y_t=\sum_i a_{ti}v_i$ 完成信息聚合。

因此，attention 的核心机制链条可以写成：

$$
Q,K
\longrightarrow
Z=\frac{QK^\top}{\sqrt{d_k}}+M
\longrightarrow
A=\operatorname{softmax}(Z/\tau)
\longrightarrow
Y=AV.
$$

上一篇已经讨论了 attention 熵如何刻画信息路由宽度。这一篇不再重复“低熵路由”和“隧道视野”，而是专门看 softmax 本身：

> softmax 到底把 logit 空间的什么几何结构，变成了概率单纯形上的竞争结构？

答案可以浓缩成一句话：

> softmax 不是普通归一化，而是从“相对 logit 优势”到“概率质量比例”的指数坐标变换。

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

也就是说，softmax 不是把 $\mathbb{R}^n$ 映射回另一个普通向量空间，而是映射到概率单纯形内部：

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

这个视角很重要。logits 生活在一个无约束空间里，而 probabilities 生活在一个有约束的几何对象上。softmax 的工作，就是把无约束的竞争分数，变成单纯形上的一个点。

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

softmax 的几何作用可以理解为：logit 向量决定这个点在单纯形里靠近哪个顶点、离中心多远、沿哪条竞争方向移动。

---

## 2. 它只关心相对差值，而不是绝对大小

很多人第一次看 softmax，会以为它在比较 logits 的绝对大小。实际上，softmax 真正使用的是相对差值。

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

这说明 softmax 对整体平移不敏感。它丢掉了 $\mathbf{1}=[1,\dots,1]$ 这个方向，只保留垂直于 $\mathbf{1}$ 的差值结构。

更几何地说，softmax 真正作用的不是整个 $\mathbb{R}^n$，而是商空间：

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

放回 attention 里，真正重要的不是某个 $z_{ti}$ 本身有多大，而是：

$$
z_{ti}-z_{tj}.
$$

也就是位置 $i$ 相比位置 $j$ 有多少相对优势。

---

## 3. Log-odds：softmax 精确保留相对优势

softmax 最干净的形式，不是直接看 $p_i$，而是看概率比值。

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

这条式子是 softmax 的核心。它说明：

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

温度 $\tau$ 不是一个神秘的平滑按钮，而是在缩放所有 log-odds。

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

这给出了一个很具体的解释：attention 的竞争不是“query 喜不喜欢某个 key”，而是“query 沿着 $k_i-k_j$ 这个差分方向，更偏向谁”。

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

这说明 softmax 在多分类里的行为，本质上就是许多 pairwise log-odds 约束同时成立。每一对类别都由一个 logit 差值控制，但这些概率又必须共同落在同一个单纯形里。

---

## 5. Log-sum-exp：softmax 是平滑最大值的梯度

softmax 还有一个更深的来源：它是 log-sum-exp 函数的梯度。

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

这说明 softmax 不是随便选出来的归一化函数，而是一个凸势函数的梯度映射。

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

所以 softmax 可以理解为：

> hardmax 的可微版本，或者平滑最大值的梯度。

这也解释了为什么它天然带有“赢家变强”的趋势：log-sum-exp 在逼近最大值，而 softmax 是这个平滑最大值对每个 logit 的敏感度。

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

这个推导给出一个很重要的解释：

> softmax 是“偏向高分”与“保持熵”之间的最优折中。

温度 $\tau$ 就是这个折中的权重。$\tau$ 越大，熵项越重要，分布越接近均匀；$\tau$ 越小，分数项越重要，分布越接近 argmax。

这比“softmax 会让分布变尖锐”更准确。softmax 不是单纯制造稀疏，而是在解一个熵正则化的选择问题。

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

因此，温度不是改变“谁比谁大”的排序，而是改变竞争方向上的强度。它控制的是从单纯形中心走向顶点的距离。

这也解释了为什么温度调节常常能显著改变生成行为：它不是给概率做线性缩放，而是在 logit 差值空间里放大或压缩所有竞争关系。

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

这个矩阵有一个非常漂亮的解释：它是 categorical distribution 的协方差矩阵。

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

这说明 softmax 的局部敏感度，等于某个方向在当前概率分布下的方差。

有两个结论很重要。

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

这就是 softmax 饱和。不是因为 softmax “坏掉了”，而是因为单纯形顶点附近已经没有多少概率质量可以重新分配。

---

## 9. 数值稳定性不是技巧，而是几何性质

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

这不是工程上的近似，而是完全等价：

$$
\operatorname{softmax}(z)
=
\operatorname{softmax}(z-\max_j z_j\cdot\mathbf{1}).
$$

原因正是前面的平移不变性。减去最大值只是选了一个更稳定的坐标原点，让所有指数项都不超过 $1$：

$$
z_i-\max_j z_j\le 0.
$$

所以，稳定 softmax 的本质是：在同一个等价类 $z+c\mathbf{1}$ 里，选择一个不会数值溢出的代表元。

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

> query 不是孤立地评价每个 key，而是在所有 key 的差分方向上做竞争判断。

位置 $i$ 是否获得更多注意力，不只取决于 $q_t^\top k_i$，还取决于它相对其他 key 的优势。

因此，softmax 给 attention 带来的不是普通归一化，而是三层机制：

1. 把每一行 logits 投影到相对差值空间；
2. 把 logit 差值转成概率 log-odds；
3. 在概率单纯形上选择一个熵正则化的竞争分布。

---

## 总结

softmax 可以从五个互相一致的角度理解。

第一，它是从无约束 logit 空间到概率单纯形内部的映射：

$$
\mathbb{R}^n
\longrightarrow
\Delta^{n-1}_{\mathrm{int}}.
$$

第二，它对整体平移不敏感，真正使用的是相对差值：

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

放回 Transformer，attention 中的 softmax 并不只是把分数“归一化为权重”。它把 query-key 产生的相对几何优势，转换成单纯形上的概率竞争结构。

所以，真正值得记住的不是：

$$
\text{softmax makes scores sum to one}.
$$

而是：

$$
\text{softmax turns relative logit geometry into probabilistic competition}.
$$

这才是 softmax 在 attention 中的几何本质。
