---
title: 'SAE 深入理解：从稀疏重构到 Superposition'
description: '从公式、几何、字典学习和机制可解释性角度理解 Sparse Autoencoder：它如何把混合 activation 解成稀疏特征方向。'
publishDate: '2026-05-07'
tags: ['SAE', 'Sparse Autoencoder', 'interpretability', 'LLM', 'mechanistic interpretability']
language: 'zh-CN'
draft: false
---

# SAE 深入理解：从稀疏重构到 Superposition

SAE 是 Sparse Autoencoder，稀疏自编码器。设输入是一个向量：

$$
x \in \mathbb{R}^{d}
$$

在大模型可解释性里，$x$ 通常是某一层的 activation，比如 MLP 输出、attention 输出、残差流向量，或者某个 token 位置上的中间表示。

SAE 的核心目标可以先用一句话概括：

> 在一个高维 activation 空间里，找到一套过完备的 feature 字典，使得每个 activation 都能用少数 feature 重构。

也就是：

$$
x \approx \text{平均向量} + \text{少数语义方向的组合}
$$

它看起来像 autoencoder，但在机制可解释性里，它更重要的角色不是压缩，而是**解混合**。

---

## 1. 编码器：把 activation 映射到稀疏特征

SAE 先用编码器得到一组隐藏特征：

$$
z = W_{\text{enc}}(x - b_{\text{dec}}) + b_{\text{enc}}
$$

$$
h = f(x) = \sigma(z)
$$

常见情况下，$\sigma$ 用 ReLU：

$$
h =
\operatorname{ReLU}
\left(
W_{\text{enc}}(x - b_{\text{dec}}) + b_{\text{enc}}
\right)
$$

其中：

$$
W_{\text{enc}} \in \mathbb{R}^{m \times d},
\qquad
h \in \mathbb{R}^{m}
$$

$m$ 是 SAE 学到的 feature 数量，通常可以比原始 activation 维度 $d$ 大很多：

$$
m > d
$$

这叫 overcomplete representation，过完备表示。它不是为了节省维度，而是为了让 SAE 有足够多的候选 feature direction 来解释模型内部的组合结构。

---

## 2. 解码器：用稀疏特征重构原向量

解码器把稀疏特征 $h$ 映射回原空间：

$$
\hat{x} = W_{\text{dec}}h + b_{\text{dec}}
$$

其中：

$$
W_{\text{dec}} \in \mathbb{R}^{d \times m}
$$

把 $W_{\text{dec}}$ 的每一列记作一个 feature direction：

$$
W_{\text{dec}}
=
\begin{bmatrix}
| & | & & | \\
d_1 & d_2 & \cdots & d_m \\
| & | & & |
\end{bmatrix}
$$

那么重构可以写成：

$$
\hat{x}
=
b_{\text{dec}}
+
\sum_{j=1}^{m} h_j d_j
$$

这就是 SAE 的核心解释：

> 原始向量 $x$ 被表示成少数几个 feature direction 的线性组合。

因为 $h$ 是稀疏的，大多数 $h_j = 0$，只有少数 feature 被激活。

---

## 3. 训练目标：重构误差 + 稀疏惩罚

SAE 的标准损失函数是：

$$
\mathcal{L}(x)
=
\underbrace{\lVert x - \hat{x} \rVert_2^2}_{\text{重构误差}}
+
\lambda
\underbrace{\lVert h \rVert_1}_{\text{稀疏惩罚}}
$$

展开就是：

$$
\mathcal{L}(x)
=
\left\lVert
x -
\left(W_{\text{dec}}h + b_{\text{dec}}\right)
\right\rVert_2^2
+
\lambda \sum_{j=1}^{m}|h_j|
$$

如果 $h$ 是 ReLU 之后的非负向量，那么：

$$
|h_j| = h_j
$$

所以稀疏项可以写成：

$$
\lVert h \rVert_1 = \sum_{j=1}^{m} h_j
$$

整个数据集上的目标是：

$$
\min_{W_{\text{enc}}, W_{\text{dec}}, b_{\text{enc}}, b_{\text{dec}}}
\frac{1}{N}
\sum_{i=1}^{N}
\left[
\left\lVert x^{(i)} - \hat{x}^{(i)} \right\rVert_2^2
+
\lambda
\left\lVert h^{(i)} \right\rVert_1
\right]
$$

其中：

$$
h^{(i)}
=
\operatorname{ReLU}
\left(
W_{\text{enc}}(x^{(i)} - b_{\text{dec}})
+
b_{\text{enc}}
\right)
$$

$$
\hat{x}^{(i)}
=
W_{\text{dec}}h^{(i)} + b_{\text{dec}}
$$

---

## 4. SAE 的深层直觉：不是压缩，而是解混合

普通 autoencoder 常被理解成压缩：

$$
x \to h \to \hat{x}
$$

但 SAE 在大模型可解释性里主要不是为了压缩，而是为了**解混合**。

一层 activation 里可能同时包含很多概念：

```text
Python 代码
函数定义
递归
括号结构
变量名
数学表达式
英文语法
```

这些概念不一定整齐地对应某一个原始神经元。一个神经元可能同时参与好几个概念，这叫 polysemanticity，多义性。SAE 的研究动机之一就是找到比原始 neuron 更接近单义的 feature direction。

所以 SAE 想做的是：

$$
\text{原始神经元坐标}
\quad \longrightarrow \quad
\text{更接近语义 feature 的坐标}
$$

Cunningham 等人在 [Sparse Autoencoders Find Highly Interpretable Features in Language Models](https://arxiv.org/abs/2309.08600) 中，用 SAE 重构语言模型内部 activation，并报告这些稀疏特征比默认基、随机方向、PCA、ICA 等替代分解更可解释。

---

## 5. 为什么 feature 数量要大于 activation 维度？

假设原始 activation 维度是：

$$
d = 768
$$

SAE 可能学习：

$$
m = 16384
$$

甚至更多 feature。直觉上这好像更复杂，但这正是设计目的。

大模型内部需要表示的潜在概念数量可能远远超过神经元维度：

```text
代码语法
医学实体
国家名
时间关系
否定语气
引用格式
数学符号
变量绑定
事实回忆
情绪语气
```

如果强行让一个神经元对应一个 feature，模型只有 $d$ 个“槽位”。但如果允许 feature 是 activation space 里的方向，模型就可以在同一个 $d$ 维空间里放入远多于 $d$ 的方向。

这就是 superposition 的直觉：

> 用低维空间承载更多 feature。代价是 feature 之间会互相干扰；但如果每次只激活少数 feature，干扰就可以被控制。

SAE 的任务是反过来：

```text
模型已经把很多 feature 叠在 activation space 里了；
SAE 尝试找出这些叠加方向。
```

---

## 6. 过完备会带来分解不唯一

如果 feature direction 很多，那么同一个 $x$ 可以有无数种表示。

例如：

$$
x \approx h_1 d_1 + h_2 d_2
$$

也可能：

$$
x \approx
0.2 d_3
+
0.4 d_7
+
0.1 d_{18}
+
0.3 d_{99}
+
0.5 d_{203}
$$

如果没有约束，模型可能用一大堆小激活拼出 $x$。这样的表示虽然能重构，但解释性很差。

所以 SAE 加上稀疏项：

$$
\lambda \lVert h \rVert_1
$$

它在说：

> 你当然可以重构 $x$，但请尽量少用 feature。

于是目标从：

$$
\min \lVert x - \hat{x} \rVert_2^2
$$

变成：

$$
\min
\left(
\lVert x - \hat{x} \rVert_2^2
+
\lambda \lVert h \rVert_1
\right)
$$

这会偏好：

$$
x \approx 2.3 d_{17} + 0.8 d_{203}
$$

而不是：

$$
x \approx 0.1d_1 + 0.1d_2 + \cdots + 0.1d_{50}
$$

---

## 7. 为什么 L1 会导致稀疏？

这是理解 SAE 的关键数学点。

先看一个极简问题。假设只有一个 feature，输入在这个方向上的投影是 $a$，我们要选一个系数 $h$：

$$
\min_h
\frac{1}{2}(a - h)^2
+
\lambda |h|
$$

这个问题的解是 soft-thresholding：

$$
h^*
=
\operatorname{sign}(a)
\max(|a|-\lambda, 0)
$$

如果要求 $h \ge 0$，类似 ReLU-SAE 的非负激活，则变成：

$$
h^* = \max(a - \lambda, 0)
$$

这说明 $L_1$ 惩罚不是简单地“让激活变小”，而是会产生阈值效果：

$$
a \le \lambda
\quad \Rightarrow \quad
h^* = 0
$$

$$
a > \lambda
\quad \Rightarrow \quad
h^* = a - \lambda
$$

也就是说：

```text
弱相关 feature：直接压成 0
强相关 feature：保留下来，但强度被缩小
```

这就是 $L_1$ 稀疏性的来源。

---

## 8. SAE 的 encoder 在近似 sparse coding

如果只看 decoder，SAE 很像字典学习：

$$
x \approx Dh
$$

其中：

$$
D = W_{\text{dec}}
$$

理想情况下，对每个输入 $x$，我们可以直接解：

$$
h^*(x)
=
\arg\min_h
\left(
\lVert x - Dh \rVert_2^2
+
\lambda \lVert h \rVert_1
\right)
$$

这就是 classical sparse coding / LASSO 风格的问题。

但问题是，每来一个新的 $x$，都重新优化一次 $h$ 很慢。SAE 的做法是训练一个 encoder：

$$
h = f_\theta(x)
$$

让它快速预测稀疏系数：

$$
h \approx h^*(x)
$$

所以 SAE 可以理解成：

$$
\text{dictionary learning}
+
\text{amortized inference}
$$

它不是每次都现场解一个优化问题，而是训练一个神经网络去近似这个优化过程。

---

## 9. Decoder 的每一列为什么叫 feature direction？

因为：

$$
\hat{x}
=
b_{\text{dec}}
+
h_1 d_1
+
h_2 d_2
+
\cdots
+
h_m d_m
$$

如果只有第 $j$ 个 feature 激活：

$$
h_j > 0,
\qquad
h_{k \ne j}=0
$$

那么：

$$
\hat{x} = b_{\text{dec}} + h_jd_j
$$

这说明 $d_j$ 是 activation space 里的一个方向。它的语义通常通过找“哪些输入强烈激活它”来解释：

$$
h_j(x) \text{ 很大}
$$

然后看这些 $x$ 对应的文本 token / 上下文是什么。

例如某个 feature 可能在这些上下文里高激活：

```text
def foo(x):
return y
for i in range
class MyModel
```

那么我们可能把它解释为：

$$
d_j \approx \text{Python code feature}
$$

---

## 10. ReLU 为什么常见？

SAE 常用：

$$
h = \operatorname{ReLU}(W_{\text{enc}}x + b_{\text{enc}})
$$

主要有三个原因。

第一，ReLU 让激活非负：

$$
h_j \ge 0
$$

这让解释更自然：

```text
feature j 出现了多少
```

而不是：

```text
feature j 正向出现 / 反向出现
```

第二，ReLU 自带稀疏性：

$$
z_j < 0
\quad \Rightarrow \quad
h_j = 0
$$

第三，ReLU 和 $L_1$ 配合后，稀疏性更强：

$$
\mathcal{L}
=
\lVert x - \hat{x} \rVert_2^2
+
\lambda \sum_j h_j
$$

因为 $h_j \ge 0$，所以 $L_1$ 惩罚会持续压低所有激活。

---

## 11. 为什么 decoder bias 也出现在 encoder 里？

SAE 常写成：

$$
h =
\operatorname{ReLU}
\left(
W_{\text{enc}}(x-b_{\text{dec}})
+
b_{\text{enc}}
\right)
$$

这里的 $b_{\text{dec}}$ 不是随便放进去的。因为 decoder 是：

$$
\hat{x} = W_{\text{dec}}h + b_{\text{dec}}
$$

$b_{\text{dec}}$ 通常会学到 activation 的平均值附近：

$$
b_{\text{dec}} \approx \mathbb{E}[x]
$$

于是 SAE 实际上不是直接分解 $x$，而是在分解：

$$
x - b_{\text{dec}}
$$

也就是 activation 相对均值的偏移。完整解释是：

$$
x
\approx
\text{平均 activation}
+
\text{少数 feature directions 的组合}
$$

这比直接从原点开始重构更合理。

---

## 12. 几何上，SAE 在做什么？

因为 $h_j \ge 0$，所以：

$$
\hat{x} - b_{\text{dec}}
=
\sum_j h_j d_j
$$

这是若干向量的非负线性组合。

如果只有少数 feature 激活，比如：

$$
h_2, h_7, h_{19} > 0
$$

其他为 0，那么：

$$
\hat{x} - b_{\text{dec}}
\in
\operatorname{cone}(d_2, d_7, d_{19})
$$

也就是落在这些方向张成的锥形区域里。

所以 SAE 把 activation space 分成很多局部区域：

```text
某些区域由 feature 2, 7, 19 解释
某些区域由 feature 3, 10, 88 解释
某些区域由 feature 5, 21 解释
```

每个输入 $x$ 都会选择一个很小的 active set：

$$
S(x) = \{j : h_j(x) > 0\}
$$

然后：

$$
x
\approx
b_{\text{dec}}
+
\sum_{j \in S(x)} h_j d_j
$$

SAE 的几何本质是：

> 用很多候选方向覆盖空间，但每个点只选少数方向。

---

## 13. SAE 为什么可能拆出“概念”？

这不是一个数学定理保证一定成功，而是一个结构假设：

$$
\text{模型内部概念是稀疏组合式的}
$$

也就是说，一个 token 位置上的 activation 通常只涉及少数当前相关的概念。

例如看到：

```python
def factorial(n):
    return 1 if n == 0 else n * factorial(n - 1)
```

某层 activation 可能包含：

```text
Python
函数定义
递归
base case
乘法
变量 n
```

但不会强烈包含：

```text
法国首都
篮球比分
莎士比亚
蛋白质折叠
```

所以 SAE 假设：

$$
x
\approx
h_{\text{Python}} d_{\text{Python}}
+
h_{\text{recursion}} d_{\text{recursion}}
+
h_{\text{base case}} d_{\text{base case}}
+
\cdots
$$

这和语言本身的组合结构一致：一句话是少数词、语法和语义关系的组合；一个程序片段是少数语法结构、变量关系和控制流模式的组合。SAE 把“数据由少数潜在因素组合而成”这个假设放进了模型。

---

## 14. 为什么普通神经元不够？

假设 activation 维度是：

$$
d = 3
$$

但真实 feature 有：

$$
m = 6
$$

比如：

```text
猫
狗
汽车
红色
室内
夜晚
```

如果坚持“一个神经元一个 feature”，最多只能表示 3 个 feature。

但如果允许 feature 是空间里的方向，就可以在 3D 空间里放 6 个方向：

$$
d_1, d_2, \ldots, d_6 \in \mathbb{R}^{3}
$$

这些方向不必互相正交。只要每次同时激活的 feature 很少，它们之间的干扰就可以控制。

这就是 superposition 的核心：

> 用低维空间承载更多 feature，代价是方向之间会干扰；稀疏激活让这种干扰变得可管理。

---

## 15. 为什么 sparse 比 dense 更可解释？

假设某个 activation 被表示成：

$$
h = [0.12, 0.08, 0.15, 0.09, 0.11, 0.07, \ldots]
$$

你很难解释它，因为几乎所有 feature 都参与了。

但如果是：

$$
h = [0, 0, 2.7, 0, 0, 1.3, 0, \ldots]
$$

那就好解释得多：

```text
feature 3 激活强
feature 6 激活中等
其他基本不相关
```

所以稀疏性带来的不只是数学上的简洁，而是认知上的可读性：

$$
\text{少数原因} \Rightarrow \text{更容易解释}
$$

---

## 16. TopK SAE：硬稀疏

有些 SAE 不用 $L_1$ 惩罚，而是直接只保留最大的 $k$ 个激活：

$$
h =
\operatorname{TopK}
\left(
W_{\text{enc}}x + b_{\text{enc}}, k
\right)
$$

也就是：

$$
h_j =
\begin{cases}
z_j, & z_j \text{ 是前 } k \text{ 大激活之一} \\
0, & \text{否则}
\end{cases}
$$

这种方法直接保证：

$$
\lVert h \rVert_0 \le k
$$

其中 $\lVert h \rVert_0$ 表示非零元素个数。

普通 $L_1$-SAE 是软稀疏：

$$
\lambda \lVert h \rVert_1
$$

TopK SAE 是硬稀疏：

$$
\lVert h \rVert_0 \le k
$$

它的直觉像是：

```text
给你一本有 10000 个词的词典；
但每句话最多只能用 k 个词来解释当前 activation。
```

[Scaling and evaluating sparse autoencoders](https://arxiv.org/abs/2406.04093) 这类工作使用 k-sparse autoencoders 来简化稀疏度调参，并研究 autoencoder size 和 sparsity 的 scaling laws。

---

## 17. SAE 的几个常见坑

### Scale degeneracy

因为：

$$
h_j d_j
=
(c h_j)
\left(
\frac{1}{c}d_j
\right)
$$

同一个重构可以通过缩放 $h_j$ 和 $d_j$ 得到。

如果不约束 $d_j$ 的范数，模型可能作弊：

$$
\lVert d_j \rVert \uparrow,
\qquad
h_j \downarrow
$$

这样 $L_1$ 惩罚变小，但重构不变。所以实践中常会对 decoder column 做归一化：

$$
\lVert d_j \rVert_2 = 1
$$

或者在训练时控制 decoder norm。

### Dead latents

有些 feature 可能永远不激活：

$$
h_j(x) = 0
\quad
\forall x
$$

这叫 dead latent / dead feature。它浪费 feature 容量，也会让名义上的 $m$ 大于实际可用的 feature 数量。

### Feature splitting

有时一个真实概念会被 SAE 分裂成多个相似 feature：

```text
feature 101 = Python function definition
feature 207 = Python function definition with indentation
feature 381 = Python function definition after newline
```

这可能说明 SAE 容量太大、正则不合适，也可能说明真实概念本来就有细粒度子结构。

### 可解释不等于真实因果

一个 feature 在“医学文本”里高激活，不一定说明它因果控制医学相关行为。

更强的验证方式是做 intervention：

$$
h_j \leftarrow 0
$$

或者：

$$
h_j \leftarrow h_j + \alpha
$$

然后观察模型输出是否按预期改变。也就是说，SAE feature 的自动解释只是第一步；机制解释最终还需要干预验证。

---

## 18. 从模型机制角度看 SAE 的三个层次

可以把 SAE 分成三层理解。

**第一层：重构层。** SAE 必须保留原 activation 的信息：

$$
\hat{x} \approx x
$$

否则它学出来的 feature 没意义。

**第二层：稀疏层。** SAE 不允许所有 feature 都参与：

$$
\lVert h \rVert_0 \ll m
$$

否则解释性很差。

**第三层：语义层。** 研究者希望每个 $d_j$ 对应某种可理解概念：

```text
feature j = 数学证明
feature k = URL
feature l = 法语
feature r = Python docstring
```

但这第三层不是直接由 loss 保证的，而是由多种因素共同诱导：

```text
真实数据的组合结构
模型 activation 的 superposition 结构
稀疏约束
过完备字典
非负激活
训练分布足够丰富
```

---

## 19. 一个完整的“深层版”公式

把 SAE 写得更完整一些：

$$
x_i \in \mathbb{R}^d
$$

$$
\tilde{x}_i = x_i - b_{\text{dec}}
$$

$$
z_i = W_{\text{enc}}\tilde{x}_i + b_{\text{enc}}
$$

$$
h_i = \operatorname{ReLU}(z_i)
$$

$$
\hat{x}_i = b_{\text{dec}} + W_{\text{dec}}h_i
$$

$$
\mathcal{L}
=
\frac{1}{N}
\sum_{i=1}^{N}
\left[
\lVert x_i - \hat{x}_i \rVert_2^2
+
\lambda \lVert h_i \rVert_1
\right]
$$

如果加入 decoder 归一化约束：

$$
\lVert d_j \rVert_2 = 1,
\qquad
j = 1,\ldots,m
$$

则更接近：

$$
\min_{D,\theta}
\frac{1}{N}
\sum_i
\left[
\left\lVert
x_i
-
b
-
D f_\theta(x_i-b)
\right\rVert_2^2
+
\lambda
\left\lVert
f_\theta(x_i-b)
\right\rVert_1
\right]
$$

subject to：

$$
\lVert d_j \rVert_2 = 1
$$

其中：

$$
D = W_{\text{dec}}
$$

$$
f_\theta(x)
=
\operatorname{ReLU}
\left(
W_{\text{enc}}x + b_{\text{enc}}
\right)
$$

---

## 20. 最核心的一句话

SAE 深层上是在解这个问题：

$$
\text{在 activation 空间里找到一套过完备 feature 字典，}
\quad
\text{让每个 activation 都能用少数 feature 重构。}
$$

也就是：

$$
x
\approx
\text{平均向量}
+
\text{少数语义方向的组合}
$$

它有三个目标：

```text
1. 重构准确：不要丢失原模型信息
2. 激活稀疏：每个输入只用少数 feature
3. 特征可解释：每个 feature 尽量对应单一概念
```

最精炼地说：

$$
\boxed{
\text{SAE = 用稀疏字典学习来反解大模型 activation 里的 superposition}
}
$$
