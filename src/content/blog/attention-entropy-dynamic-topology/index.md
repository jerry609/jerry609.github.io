---
title: '注意力熵与动态拓扑：从信息路由到隧道视野'
description: '把自注意力看成输入依赖的动态图，用香农熵刻画信息路由宽度，并解释低熵注意力何时有利、何时会造成隧道视野。'
publishDate: '2026-05-24'
tags: ['LLM', 'Transformer', 'Attention', '信息熵', '机制分析']
language: 'zh-CN'
draft: false
---

# 注意力熵与动态拓扑

Transformer 的自注意力机制可以看成一个**由输入动态生成的加权有向图**。

在这个图里，token 是节点，注意力权重是边。第 $t$ 个位置从第 $i$ 个位置读取多少信息，不是提前写死的结构，而是由当前输入 $X$ 经过 $Q,K,V$ 投影、打分、mask 和 softmax 之后即时生成的。

这篇文章讨论一个更细的问题：

> 注意力分布的熵，能不能刻画 Transformer 的信息路由宽度？

答案是可以，但要小心解释。低熵注意力不是天然更好，高熵注意力也不是天然更好。它们分别对应不同的信息分配形态：低熵是窄路由，适合精确定位；高熵是宽覆盖，适合全局聚合。真正重要的是：**注意力熵要和任务证据的分布形态匹配**。

---

## 1. 自注意力是一张输入依赖的动态图

给定第 $\ell$ 层的输入表示：

$$
X^{(\ell)}
=
\begin{bmatrix}
x_1^{(\ell)} \\
x_2^{(\ell)} \\
\vdots \\
x_n^{(\ell)}
\end{bmatrix}
\in \mathbb{R}^{n \times d_{\mathrm{model}}},
$$

其中 $n$ 是序列长度，$x_i^{(\ell)}$ 是第 $\ell$ 层第 $i$ 个 token 的表示。

对第 $\ell$ 层第 $h$ 个 attention head，有三组线性投影：

$$
Q^{(\ell,h)} = X^{(\ell)} W_Q^{(\ell,h)},\qquad
K^{(\ell,h)} = X^{(\ell)} W_K^{(\ell,h)},\qquad
V^{(\ell,h)} = X^{(\ell)} W_V^{(\ell,h)}.
$$

其中：

$$
W_Q^{(\ell,h)}, W_K^{(\ell,h)}
\in \mathbb{R}^{d_{\mathrm{model}}\times d_k},
\qquad
W_V^{(\ell,h)}
\in \mathbb{R}^{d_{\mathrm{model}}\times d_v}.
$$

对当前位置 $t$，query 向量是：

$$
q_t^{(\ell,h)} = x_t^{(\ell)} W_Q^{(\ell,h)}.
$$

对上下文位置 $i$，key 和 value 分别是：

$$
k_i^{(\ell,h)} = x_i^{(\ell)} W_K^{(\ell,h)},
\qquad
v_i^{(\ell,h)} = x_i^{(\ell)} W_V^{(\ell,h)}.
$$

注意力打分为：

$$
s_{ti}^{(\ell,h)}
=
\frac{
q_t^{(\ell,h)} \cdot k_i^{(\ell,h)}
}{
\sqrt{d_k}
}
+
m_{ti}.
$$

这里的 $m_{ti}$ 是 mask 项。对 causal language model：

$$
m_{ti}
=
\begin{cases}
0, & i \le t,\\
-\infty, & i > t.
\end{cases}
$$

然后用 softmax 得到注意力权重：

$$
a_{ti}^{(\ell,h)}
=
\frac{
\exp\left(s_{ti}^{(\ell,h)} / \tau\right)
}{
\sum_{j\in\Omega_t}
\exp\left(s_{tj}^{(\ell,h)} / \tau\right)
},
$$

其中 $\tau>0$ 是温度系数，$\Omega_t$ 是位置 $t$ 可以看到的 token 集合。$a_{ti}^{(\ell,h)}$ 表示位置 $t$ 从位置 $i$ 读取信息的强度。

最终，第 $h$ 个 head 在位置 $t$ 的输出为：

$$
y_t^{(\ell,h)}
=
\sum_{i\in\Omega_t}
a_{ti}^{(\ell,h)} v_i^{(\ell,h)}.
$$

所以，一个 attention head 实际上定义了动态图：

$$
G^{(\ell,h)}(X)
=
(\mathcal{V},\mathcal{E},A^{(\ell,h)}),
$$

其中：

$$
\mathcal{V}=\{1,2,\dots,n\},
\qquad
A^{(\ell,h)}
=
\left[a_{ti}^{(\ell,h)}\right]_{t,i=1}^{n}.
$$

边 $i\to t$ 的权重就是 $a_{ti}^{(\ell,h)}$。这个图是输入依赖的：输入 $X$ 改变，$Q,K,V$ 改变，分数矩阵 $S$ 改变，最终注意力图 $A$ 也改变。

---

## 2. 从注意力分布到香农熵

固定层 $\ell$、head $h$ 和目标位置 $t$，注意力向量可以写成：

$$
a_t^{(\ell,h)}
=
\left[
a_{t1}^{(\ell,h)},
a_{t2}^{(\ell,h)},
\dots,
a_{tn}^{(\ell,h)}
\right].
$$

由于 softmax 的归一化性质：

$$
a_{ti}^{(\ell,h)}\ge 0,
\qquad
\sum_{i\in\Omega_t}a_{ti}^{(\ell,h)}=1,
$$

$a_t^{(\ell,h)}$ 可以被看成一个概率分布。

我们用香农熵衡量这个分布的分散程度：

$$
H_t^{(\ell,h)}
=
-
\sum_{i\in\Omega_t}
a_{ti}^{(\ell,h)}
\log\left(a_{ti}^{(\ell,h)}+\varepsilon\right).
$$

这里 $\varepsilon$ 只是数值保护项，用来避免 $\log 0$。如果只在可见集合 $\Omega_t$ 上计算，softmax 权重通常为正；如果把 mask 后的位置也放进向量里，则这些位置权重为 $0$，按惯例 $0\log 0=0$。

如果可见集合大小为 $|\Omega_t|=m$，则：

$$
0\le H_t^{(\ell,h)}\le \log m.
$$

低熵表示注意力集中。若几乎所有权重集中在某个位置 $r$：

$$
a_{tr}^{(\ell,h)}\approx 1,
\qquad
a_{ti}^{(\ell,h)}\approx 0\quad (i\ne r),
$$

则：

$$
H_t^{(\ell,h)}\approx 0.
$$

图结构上，这意味着位置 $t$ 的入边几乎只剩一条强边 $r\to t$。

高熵表示注意力分散。若注意力接近均匀分布：

$$
a_{ti}^{(\ell,h)}\approx \frac{1}{m},
\qquad i\in\Omega_t,
$$

则：

$$
H_t^{(\ell,h)}
\approx
-
\sum_{i=1}^{m}
\frac{1}{m}
\log\frac{1}{m}
=
\log m.
$$

图结构上，这意味着当前位置保留了大量中等强度的入边。

为了消除上下文长度影响，可以使用归一化熵：

$$
\bar{H}_t^{(\ell,h)}
=
\frac{
H_t^{(\ell,h)}
}{
\log|\Omega_t|
},
\qquad
0\le \bar{H}_t^{(\ell,h)}\le 1.
$$

其中 $\bar{H}_t^{(\ell,h)}\approx 0$ 表示注意力极度集中，$\bar{H}_t^{(\ell,h)}\approx 1$ 表示注意力接近均匀。

还可以定义有效上下文大小：

$$
N_{\mathrm{eff}}(t,\ell,h)
=
\exp\left(H_t^{(\ell,h)}\right).
$$

这个量比原始熵更直观。若 $N_{\mathrm{eff}}\approx 1$，说明当前 head 几乎只在使用一个 token；若 $N_{\mathrm{eff}}\approx m$，说明它正在接近均匀地使用 $m$ 个 token。

---

## 3. 温度、logit 间隔与注意力尖锐化

注意力权重由 softmax 产生：

$$
a_i
=
\frac{\exp(z_i/\tau)}
{\sum_j \exp(z_j/\tau)},
$$

其中 $z_i$ 是 attention logit，$\tau$ 是温度。

为了看清温度的作用，只考虑两个 token，logit 分别是 $z_1,z_2$。定义间隔：

$$
\Delta = z_1-z_2.
$$

则权重比为：

$$
\frac{a_1}{a_2}
=
\frac{\exp(z_1/\tau)}{\exp(z_2/\tau)}
=
\exp\left(\frac{\Delta}{\tau}\right).
$$

这个式子直接说明三件事：

1. $\Delta$ 越大，强 token 和弱 token 的权重比越大。
2. $\tau$ 越小，同样的 logit 间隔会被放大得越强。
3. $\tau$ 越大，softmax 越平滑，注意力熵越高。

二元情况下：

$$
a_1
=
\frac{1}{1+\exp(-\Delta/\tau)},
\qquad
a_2=1-a_1.
$$

对应的信息熵为：

$$
H
=
-
a_1\log a_1
-
a_2\log a_2.
$$

当 $\Delta/\tau\to +\infty$ 时：

$$
a_1\to 1,\qquad a_2\to 0,\qquad H\to 0.
$$

当 $\Delta/\tau\to 0$ 时：

$$
a_1\to \frac{1}{2},
\qquad
a_2\to \frac{1}{2},
\qquad
H\to \log 2.
$$

因此，注意力尖锐化的核心算子链条是：

$$
Q,K
\longrightarrow
S=\frac{QK^\top}{\sqrt{d_k}}+M
\longrightarrow
A=\operatorname{softmax}(S/\tau)
\longrightarrow
H(A).
$$

$S$ 决定 logit 间隔，$\tau$ 决定间隔被放大的程度，$H(A)$ 描述最终注意力图的稀疏程度。

---

## 4. 低熵注意力如何形成稀疏信息通路

第 $\ell$ 层第 $h$ 个 head 的输出为：

$$
y_t^{(\ell,h)}
=
\sum_{i\in\Omega_t}
a_{ti}^{(\ell,h)}
v_i^{(\ell,h)}.
$$

如果存在一个很小的 token 集合 $S_t$，满足：

$$
\sum_{i\in S_t}
a_{ti}^{(\ell,h)}
\ge
1-\delta,
\qquad
|S_t|\ll |\Omega_t|,
$$

其中 $\delta$ 很小，那么：

$$
y_t^{(\ell,h)}
=
\sum_{i\in S_t}
a_{ti}^{(\ell,h)}
v_i^{(\ell,h)}
+
\sum_{i\notin S_t}
a_{ti}^{(\ell,h)}
v_i^{(\ell,h)}.
$$

若所有 value 向量有界：

$$
\left\|v_i^{(\ell,h)}\right\|_2\le B,
$$

则被忽略部分的范数满足：

$$
\left\|
\sum_{i\notin S_t}
a_{ti}^{(\ell,h)}
v_i^{(\ell,h)}
\right\|_2
\le
\sum_{i\notin S_t}
a_{ti}^{(\ell,h)}
\left\|v_i^{(\ell,h)}\right\|_2
\le
\delta B.
$$

因此，当 $\delta$ 很小时：

$$
y_t^{(\ell,h)}
\approx
\sum_{i\in S_t}
a_{ti}^{(\ell,h)}
v_i^{(\ell,h)}.
$$

这就是注意力路由的数学形式：当前位置 $t$ 的表示更新主要依赖少数几个 source token。

多头注意力中，每个 head 都产生一个路由结果：

$$
y_t^{(\ell,1)},y_t^{(\ell,2)},\dots,y_t^{(\ell,H)}.
$$

拼接后经过输出投影：

$$
o_t^{(\ell)}
=
\operatorname{Concat}
\left(
y_t^{(\ell,1)},
\dots,
y_t^{(\ell,H)}
\right)
W_O^{(\ell)}.
$$

再进入残差流：

$$
x_t^{(\ell+1)}
=
x_t^{(\ell)}
+
o_t^{(\ell)}
+
\operatorname{MLP}^{(\ell)}
\left(
x_t^{(\ell)}+o_t^{(\ell)}
\right).
$$

这里省略 LayerNorm 的具体位置，因为不同架构可能使用 Pre-LN 或 Post-LN。

从图的角度看，低熵 attention head 在做一件事：

$$
\text{many possible edges}
\longrightarrow
\text{few active edges}.
$$

这种稀疏路由对精确定位任务尤其有利。

| 场景       | 任务                 | 合适的注意力形态     | 机制                                                             |
| ---------- | -------------------- | -------------------- | ---------------------------------------------------------------- |
| 长文本检索 | Needle in a Haystack | 低熵，高 top-k mass  | 答案通常位于少数关键句子，尖锐注意力可以把读取带宽集中到相关位置 |
| 信息抽取   | 实体、属性、关系抽取 | 低熵，中等到高稀疏   | 当前 token 需要从特定实体、数字、时间或属性位置读取信息          |
| 代码补全   | 参数、变量、函数调用 | 低熵，结构化稀疏     | 代码依赖常常指向明确的定义位置、调用位置或作用域边界             |
| 指代消解   | 代词到实体           | 低熵，单点或少点路由 | 代词表示需要绑定到前文某个实体表示                               |

---

## 5. 隧道视野：低熵路由在全局任务中的失效模式

低熵注意力本身没有问题。问题出现在任务需要全局证据，而模型仍然只保留少数注意力边。

设某个全局任务需要聚合多个 token 上的弱证据。可以把真实任务信号抽象为：

$$
g
=
\sum_{i\in\Omega_t}
\beta_i \phi_i,
$$

其中 $\phi_i$ 是第 $i$ 个 token 携带的语义特征，$\beta_i$ 是该 token 对任务目标的真实贡献。对摘要、语气判断、主题识别等任务，$\beta_i$ 往往分布在很多位置上。

模型通过注意力读取的信号为：

$$
\hat{g}_t
=
\sum_{i\in\Omega_t}
a_{ti}\phi_i.
$$

如果注意力集中在小集合 $S_t$ 上：

$$
\sum_{i\in S_t} a_{ti}\ge 1-\delta,
$$

那么模型主要看到：

$$
\hat{g}_t
\approx
\sum_{i\in S_t}
a_{ti}\phi_i.
$$

被遗漏的全局信号为：

$$
g_{\mathrm{miss}}
=
\sum_{i\notin S_t}
\beta_i\phi_i.
$$

当下面两个条件同时出现时，就会发生隧道视野：

$$
\bar{H}(a_t)\approx 0,
\qquad
H(\beta)\ \text{较高}.
$$

第一条表示模型注意力很集中。第二条表示任务证据本身很分散。两者不匹配，就会造成全局任务失焦。

可以把隧道视野定义成一种**熵错配现象**：

$$
\operatorname{TunnelVision}(t)
=
\mathbb{I}\left[\bar{H}(a_t)<\alpha\right]
\cdot
\mathbb{I}\left[\bar{H}(\beta)>\gamma\right],
$$

其中 $\alpha$ 是低注意力熵阈值，$\gamma$ 是高任务证据熵阈值，$\mathbb{I}[\cdot]$ 是指示函数。

直观地说，模型只开了一条很窄的信息通道，但任务需要从很多位置同时收集证据。

---

## 6. Softmax 梯度饱和：为什么隧道视野会固化

注意力权重为：

$$
a_i
=
\frac{\exp(z_i/\tau)}
{\sum_j\exp(z_j/\tau)}.
$$

softmax 的雅可比矩阵为：

$$
\frac{\partial a_i}{\partial z_j}
=
\frac{1}{\tau}
a_i
\left(
\mathbb{I}[i=j]-a_j
\right).
$$

当某个位置 $r$ 的注意力接近 $1$ 时：

$$
a_r\approx 1,
\qquad
a_i\approx 0\quad(i\ne r).
$$

此时：

$$
\frac{\partial a_i}{\partial z_j}
\approx
0.
$$

这意味着 softmax 进入饱和区。被压低到接近 $0$ 的注意力边，很难通过梯度重新获得较大权重。

对被忽略 token $i$ 来说：

$$
a_i\approx 0
\quad\Longrightarrow\quad
\left|
\frac{\partial a_i}{\partial z_j}
\right|
=
O(a_i/\tau).
$$

所以，当某些上下文线索在早期层被压到极低权重时，它们对后续训练信号的贡献也会变弱。模型容易形成稳定但狭窄的路由模式。

这就是隧道视野的训练动力学版本：

$$
\text{early logit gap}
\longrightarrow
\text{low-entropy attention}
\longrightarrow
\text{weak gradient for suppressed edges}
\longrightarrow
\text{route becomes harder to revise}.
$$

---

## 7. 稀疏度是任务相关的资源分配参数

注意力稀疏度需要和任务结构匹配。它不能被看成单调收益指标。

| 任务类型     | 任务例子                           | 推荐注意力形态      | 原因                                       |
| ------------ | ---------------------------------- | ------------------- | ------------------------------------------ |
| 精确定位     | 长文本检索、事实抽取、代码变量绑定 | 低熵，高 top-k mass | 目标证据集中在少数位置，强路由可以压制噪声 |
| 局部结构建模 | 指代消解、依存关系、函数调用关系   | 中低熵，结构化稀疏  | 需要若干关键边，不需要全局平均             |
| 全局理解     | 摘要、主题识别、语气分析           | 中高熵，覆盖面更广  | 任务证据分布在多处，过度尖锐会丢失弱信号   |
| 多证据推理   | 多跳问答、法律或医学长文判断       | 分阶段熵变化        | 早期需要广覆盖，中后期需要聚焦到证据链     |
| 生成控制     | 风格保持、长文一致性               | 避免长期极低熵      | 需要维持全局状态、语气和结构约束           |

更精确地说，可以用下面三个量诊断一个 head 的行为。

### 归一化熵

$$
\bar{H}_t^{(\ell,h)}
=
-
\frac{
\sum_i
a_{ti}^{(\ell,h)}
\log\left(a_{ti}^{(\ell,h)}+\varepsilon\right)
}{
\log|\Omega_t|
}.
$$

它衡量注意力分布相对最大熵有多分散。

### Top-k 注意力质量

$$
M_k(t,\ell,h)
=
\sum_{i\in\operatorname{TopK}(a_t^{(\ell,h)},k)}
a_{ti}^{(\ell,h)}.
$$

如果 $M_1$ 或 $M_5$ 很高，说明注意力集中在极少数位置。

### 有效上下文大小

$$
N_{\mathrm{eff}}(t,\ell,h)
=
\exp\left(H_t^{(\ell,h)}\right).
$$

比如 $N_{\mathrm{eff}}=3$，可以理解为当前 head 大约只在使用 $3$ 个 token。

---

## 8. 如何调控注意力熵

调控注意力熵，本质上是在调控 Transformer 的信息路由宽度。

### 方法一：温度缩放

$$
A=\operatorname{softmax}(S/\tau).
$$

当 $\tau$ 增大，$(z_i-z_j)/\tau$ 变小，注意力更平滑，熵升高。当 $\tau$ 减小，logit 间隔被放大，注意力更尖锐，熵降低。

### 方法二：熵正则

如果希望鼓励稀疏注意力，可以最小化熵：

$$
\mathcal{L}
=
\mathcal{L}_{\mathrm{task}}
+
\lambda
\sum_{\ell,h,t}
H_t^{(\ell,h)}.
$$

如果希望鼓励覆盖更多上下文，可以最大化熵：

$$
\mathcal{L}
=
\mathcal{L}_{\mathrm{task}}
-
\lambda
\sum_{\ell,h,t}
H_t^{(\ell,h)}.
$$

如果希望注意力熵靠近某个目标值 $H^\star$，可以使用：

$$
\mathcal{L}
=
\mathcal{L}_{\mathrm{task}}
+
\lambda
\sum_{\ell,h,t}
\left(
H_t^{(\ell,h)}-H^\star
\right)^2.
$$

### 方法三：结构化 mask

通过 mask 控制可见边：

$$
s_{ti}
=
\frac{q_t\cdot k_i}{\sqrt{d_k}}
+
m_{ti},
$$

其中：

$$
m_{ti}
=
\begin{cases}
0, & \text{edge } i\to t \text{ allowed},\\
-\infty, & \text{edge } i\to t \text{ forbidden}.
\end{cases}
$$

这会直接改变动态图的边集合。

### 方法四：Sparsemax 和 Entmax

softmax 总会给每个可见位置一个非零概率。为了得到真正的零权重，可以使用 sparsemax：

$$
\operatorname{sparsemax}(z)
=
\arg\min_{p\in\Delta^{m-1}}
\|p-z\|_2^2,
$$

其中 $\Delta^{m-1}$ 是概率单纯形：

$$
\Delta^{m-1}
=
\left\{
p\in\mathbb{R}^{m}
:
p_i\ge 0,\
\sum_i p_i=1
\right\}.
$$

sparsemax 可以产生精确的零权重，因此会让注意力图变成真正的稀疏图。Entmax 则处在 softmax 和 sparsemax 之间，用一个可调参数控制稀疏程度。

---

## 9. 总结：注意力熵刻画信息路由的宽度

自注意力的核心算子链条是：

$$
X
\longrightarrow
(Q,K,V)
\longrightarrow
S=QK^\top/\sqrt{d_k}+M
\longrightarrow
A=\operatorname{softmax}(S/\tau)
\longrightarrow
Y=AV.
$$

其中，$A$ 是动态生成的注意力图。它同时决定：

1. 哪些 token 之间发生信息传递；
2. 每条信息通路的强度；
3. 当前层的信息聚合范围；
4. 梯度能够通过哪些路径有效回传。

香农熵提供了一个直接的量化工具：

$$
H(a_t)
=
-
\sum_i
a_{ti}
\log(a_{ti}+\varepsilon).
$$

低熵注意力对应窄路由，适合检索、抽取、代码绑定等精确定位任务。高熵注意力对应宽路由，适合摘要、主题识别、语气分析等全局聚合任务。

隧道视野可以被理解为注意力熵和任务证据熵之间的错配：

$$
\bar{H}(a_t)\ \text{low},
\qquad
\bar{H}(\beta)\ \text{high}.
$$

当模型只保留少数强注意力边，而任务答案依赖大量分布式弱线索时，信息路由会变窄，梯度会在 softmax 饱和区变弱，模型最终容易固化到局部证据上。

因此，注意力稀疏性更适合作为一种**动态资源分配参数**来理解。温度、熵正则、mask 结构和稀疏归一化算子，调控的都是同一个东西：Transformer 在当前层、当前 head、当前 token 上打开的信息通道有多宽。
