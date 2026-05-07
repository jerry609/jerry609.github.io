---
title: '数学工具 2：Ridge 问题'
description: '把 Ridge regression 写成最小二乘加 L2 正则项的问题，解释它惩罚什么、为什么更稳定、解析解如何推导，以及和 LASSO 的区别。'
publishDate: '2026-05-07'
tags: ['数学', 'Ridge', '岭回归', '线性代数', '凸优化', '机器学习', '数学工具集合']
language: 'zh-CN'
draft: false
---

# 数学工具 2：Ridge 问题

这篇是[数学工具集合](/blog/math-toolkit-collection)里的第二个工具：**Ridge 问题**。

Ridge 问题就是在普通最小二乘问题后面加一个 **L2 正则项** 的优化问题，也叫 **ridge regression**，中文常译为**岭回归**。

在前面的记号里，普通 least squares 是：

$$
h^\star=\arg\min_h \frac{1}{2}\|x-Dh\|_2^2
$$

Ridge 问题是：

$$
h^\star=\arg\min_h
\left[
\frac{1}{2}\|x-Dh\|_2^2
+
\frac{\lambda}{2}\|h\|_2^2
\right]
$$

其中：

$$
x
$$

是你想表示的数据；

$$
D
$$

是字典矩阵、特征矩阵或设计矩阵；

$$
h
$$

是要求的系数；

$$
\lambda\geq 0
$$

是正则化强度。

---

## 1. Ridge 在惩罚什么？

Ridge 惩罚的是：

$$
\|h\|_2^2
$$

展开就是：

$$
\|h\|_2^2
=
h_1^2+h_2^2+\cdots+h_k^2
$$

所以 ridge 的完整展开是：

$$
h^\star
=
\arg\min_{h_1,\ldots,h_k}
\left[
\frac{1}{2}
\sum_{i=1}^{m}
\left(
x_i-\sum_{j=1}^{k}d_{ij}h_j
\right)^2
+
\frac{\lambda}{2}
\sum_{j=1}^{k}h_j^2
\right]
$$

第一项：

$$
\frac{1}{2}\|x-Dh\|_2^2
$$

要求 $Dh$ 尽量接近 $x$。

第二项：

$$
\frac{\lambda}{2}\|h\|_2^2
$$

要求 $h$ 不要太大。

所以 ridge 同时做两件事：

$$
\text{拟合数据}+\text{压小系数}
$$

---

## 2. 为什么要加 Ridge？

普通最小二乘的解析解是：

$$
h^\star=(D^\top D)^{-1}D^\top x
$$

但这个公式有一个问题：如果

$$
D^\top D
$$

不可逆，或者非常接近不可逆，那么解会不稳定。

例如特征之间高度相关时，普通最小二乘可能会得到很大的系数：

$$
h_1=1000,\quad h_2=-999
$$

虽然它们组合后可能能拟合数据，但这种解非常脆弱。数据稍微变化一点，系数就可能剧烈变化。

Ridge 会惩罚大系数，所以会倾向于得到更平滑、更稳定的解。

---

## 3. Ridge 的解析解怎么推导？

Ridge 目标函数是：

$$
J(h)
=
\frac{1}{2}\|x-Dh\|_2^2
+
\frac{\lambda}{2}\|h\|_2^2
$$

先展开第一项：

$$
\|x-Dh\|_2^2
=
(x-Dh)^\top(x-Dh)
$$

展开乘法：

$$
(x-Dh)^\top(x-Dh)
=
x^\top x
-
x^\top Dh
-
(Dh)^\top x
+
(Dh)^\top Dh
$$

因为

$$
x^\top Dh
$$

是一个标量，所以：

$$
x^\top Dh=(Dh)^\top x
$$

同时：

$$
(Dh)^\top x = h^\top D^\top x
$$

以及：

$$
(Dh)^\top Dh = h^\top D^\top D h
$$

因此：

$$
\|x-Dh\|_2^2
=
x^\top x
-
2h^\top D^\top x
+
h^\top D^\top D h
$$

Ridge 目标变成：

$$
J(h)
=
\frac{1}{2}
\left(
x^\top x
-
2h^\top D^\top x
+
h^\top D^\top D h
\right)
+
\frac{\lambda}{2}h^\top h
$$

继续整理：

$$
J(h)
=
\frac{1}{2}x^\top x
-
h^\top D^\top x
+
\frac{1}{2}h^\top D^\top D h
+
\frac{\lambda}{2}h^\top h
$$

对 $h$ 求梯度：

$$
\nabla_h J(h)
=
-D^\top x
+
D^\top D h
+
\lambda h
$$

合并：

$$
\nabla_h J(h)
=
(D^\top D+\lambda I)h-D^\top x
$$

令梯度等于 $0$：

$$
(D^\top D+\lambda I)h-D^\top x=0
$$

所以：

$$
(D^\top D+\lambda I)h=D^\top x
$$

如果 $\lambda>0$，通常

$$
D^\top D+\lambda I
$$

会变得可逆。

于是得到 ridge 解：

$$
\boxed{
h^\star=(D^\top D+\lambda I)^{-1}D^\top x
}
$$

---

## 4. Ridge 和 LASSO 的区别

LASSO 是：

$$
\min_h
\frac{1}{2}\|x-Dh\|_2^2+\lambda\|h\|_1
$$

其中：

$$
\|h\|_1=|h_1|+\cdots+|h_k|
$$

Ridge 是：

$$
\min_h
\frac{1}{2}\|x-Dh\|_2^2+\frac{\lambda}{2}\|h\|_2^2
$$

其中：

$$
\|h\|_2^2=h_1^2+\cdots+h_k^2
$$

核心区别是：

$$
\text{LASSO：容易让一些 }h_j\text{ 精确变成 }0
$$

$$
\text{Ridge：通常只是把 }h_j\text{ 压小，不会精确变成 }0
$$

| 方法 | 正则项 | 效果 |
| --- | --- | --- |
| Least Squares | 无 | 只追求拟合 |
| Ridge | $\lambda\|h\|_2^2$ | 压小系数，提升稳定性 |
| LASSO | $\lambda\|h\|_1$ | 压小系数，并产生稀疏性 |

---

## 5. 一个最简单的一维例子

看一维 ridge：

$$
\min_h \frac{1}{2}(x-h)^2+\frac{\lambda}{2}h^2
$$

也就是：

$$
J(h)=\frac{1}{2}(x-h)^2+\frac{\lambda}{2}h^2
$$

先展开平方：

$$
(x-h)^2=x^2-2xh+h^2
$$

所以：

$$
J(h)=\frac{1}{2}x^2-xh+\frac{1}{2}h^2+\frac{\lambda}{2}h^2
$$

合并 $h^2$ 项：

$$
J(h)=\frac{1}{2}x^2-xh+\frac{1+\lambda}{2}h^2
$$

求导：

$$
J'(h)=-x+(1+\lambda)h
$$

令导数为 $0$：

$$
-x+(1+\lambda)h=0
$$

所以：

$$
(1+\lambda)h=x
$$

得到：

$$
h^\star=\frac{x}{1+\lambda}
$$

这说明 ridge 会把原来的 $x$ 缩小：

$$
x \mapsto \frac{x}{1+\lambda}
$$

如果：

$$
\lambda=0
$$

那么：

$$
h^\star=x
$$

如果：

$$
\lambda=1
$$

那么：

$$
h^\star=\frac{x}{2}
$$

如果：

$$
\lambda=9
$$

那么：

$$
h^\star=\frac{x}{10}
$$

所以 $\lambda$ 越大，系数越小。

---

## 6. 一句话总结

> Ridge 问题就是在最小二乘后面加 L2 惩罚，让系数变小、解更稳定的问题。

它的标准形式是：

$$
\boxed{
h^\star=\arg\min_h
\left[
\frac{1}{2}\|x-Dh\|_2^2
+
\frac{\lambda}{2}\|h\|_2^2
\right]
}
$$

解析解是：

$$
\boxed{
h^\star=(D^\top D+\lambda I)^{-1}D^\top x
}
$$
