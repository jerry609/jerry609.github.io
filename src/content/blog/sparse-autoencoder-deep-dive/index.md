---
title: 'SAE 深入理解：从 Superposition 到机制诊断'
description: '从重构、稀疏字典、superposition 和干预验证角度理解 Sparse Autoencoder：它如何把混合 activation 转化为可检验的 feature 假设。'
publishDate: '2026-05-07'
tags: ['SAE', 'Sparse Autoencoder', 'interpretability', 'LLM', 'mechanistic interpretability']
language: 'zh-CN'
draft: false
---

SAE 容易被理解成一种“给 activation 做压缩”的 autoencoder。这个说法只抓住了形式，没有解释它为什么能成为机制可解释性里的诊断工具。

现代语言模型的内部表示通常不是一个神经元对应一个概念。一个 activation 可能同时混入语法、实体、任务格式、情绪语气和局部控制信号。已有的 neuron-level 分析能看到部分相关性，但很难解释这些因素如何在同一个向量空间里重叠、分离并影响行为。

SAE 给出的新视角是：在模型内部的 activation 空间里学习一套过完备、稀疏、相对可解释的 feature 字典。每个 activation 仍然保留原模型的信息，但它被改写成少数 feature direction 的组合。这样，superposition 不再只是“很多东西混在一起”的描述，而变成可以被命名、排序和干预的候选机制。

可以先把主线压成一句话：

> SAE 的目标不在压缩向量长度；它要把混在同一个 activation 里的语义因素拆成可检验的 feature 假设。

形式上，给定某层某个 token 位置的 activation：

$$
x\in\mathbb{R}^d
$$

SAE 希望得到：

$$
x\approx b_{\mathrm{dec}}+\sum_{j\in S(x)}h_jd_j,\qquad |S(x)|\ll m
$$

其中 $d_j$ 是 decoder 的第 $j$ 个 feature direction，$h_j$ 是该 feature 的激活强度，$S(x)$ 是当前输入实际用到的少数 feature 集合。

本文按一条机制链理解 SAE：先用稀疏重构把 activation 改写成 feature 组合，再用高激活样本和下游读数给 feature 命名，最后用干预验证区分“可读相关性”和“因果机制”。

## 符号表

| 符号 | 含义 |
| --- | --- |
| $x$ | 某层某 token 的 activation |
| $d$ | 原始 activation 维度 |
| $m$ | SAE feature 数量，通常 $m>d$ |
| $W_{\mathrm{enc}}$ | encoder 权重 |
| $W_{\mathrm{dec}}$ | decoder 权重 |
| $b_{\mathrm{enc}},b_{\mathrm{dec}}$ | encoder / decoder bias |
| $h$ | SAE 得到的稀疏 feature activation |
| $d_j$ | decoder 的第 $j$ 列，即第 $j$ 个 feature direction |
| $D$ | decoder dictionary，$D=[d_1,\ldots,d_m]$ |
| $\lambda$ | 稀疏惩罚强度 |
| $S(x)$ | 输入 $x$ 激活的 feature 集合 |
| $F$ | 从某层 activation 到后续 logits 或行为读数的映射 |

## 1. SAE 的基本形态

普通 autoencoder 常被写成：

$$
x\to h\to \hat{x}
$$

SAE 也有 encoder 和 decoder，但关注点从低维瓶颈转向稀疏分解。常见 ReLU-SAE 可以写成：

$$
h=\operatorname{ReLU}\left(W_{\mathrm{enc}}(x-b_{\mathrm{dec}})+b_{\mathrm{enc}}\right)
$$

$$
\hat{x}=W_{\mathrm{dec}}h+b_{\mathrm{dec}}
$$

把 $W_{\mathrm{dec}}$ 按列拆开：

$$
W_{\mathrm{dec}}=[d_1,d_2,\ldots,d_m]
$$

则重构就是：

$$
\hat{x}=b_{\mathrm{dec}}+\sum_{j=1}^m h_jd_j
$$

这条式子给出 SAE 的核心接口：encoder 负责判断当前 activation 暴露出哪些 feature；decoder 负责用这些 feature direction 把 activation 重构回原空间。

$b_{\mathrm{dec}}$ 通常接近 activation 的均值，SAE 实际分解的是相对均值的偏移：

$$
x-b_{\mathrm{dec}}\approx\sum_{j=1}^mh_jd_j
$$

SAE 不从原点解释 $x$；它解释当前 activation 相对平均状态增加了哪些方向。feature 更接近局部状态的增量信号，而非脱离上下文的固定标签。

## 2. 训练目标：重构准确，同时激活稀疏

SAE 的标准目标由两部分组成：

$$
\mathcal{L}(x)
=
\underbrace{\lVert x-\hat{x}\rVert_2^2}_{\text{重构误差}}
+
\lambda\underbrace{\lVert h\rVert_1}_{\text{稀疏惩罚}}
$$

重构误差要求 $\hat{x}$ 尽量接近原始 activation，否则 feature 只是表面标签，不能代表模型内部真实状态。稀疏惩罚要求每个输入只使用少数 feature，否则表示会变成一堆小激活的平均混合，解释性又回到原点。

在 ReLU-SAE 中，$h_j\ge 0$：

$$
\lVert h\rVert_1=\sum_{j=1}^mh_j
$$

整体训练目标可以写成：

$$
\min_{W_{\mathrm{enc}},W_{\mathrm{dec}},b_{\mathrm{enc}},b_{\mathrm{dec}}}
\frac{1}{N}\sum_{i=1}^N
\left[
\lVert x^{(i)}-\hat{x}^{(i)}\rVert_2^2+\lambda\lVert h^{(i)}\rVert_1
\right]
$$

SAE 的目标从“尽量少维”转向“尽量少 feature”。这一区别决定了 SAE 的诊断价值：它保留原 activation 的行为信息，同时让解释集中到少数候选原因上。

## 3. 为什么要过完备

SAE 常让 feature 数量 $m$ 大于 activation 维度 $d$：

$$
m>d
$$

这种设计看起来更复杂，却对应大模型内部表示的一个基本矛盾：模型需要表达的潜在 feature 数量可能远超神经元维度。

例如同一层 activation 可能要同时承载：

```text
Python 代码、函数定义、变量绑定、数学符号、引用格式、医学实体、时间关系、否定语气
```

如果坚持“一个神经元一个 feature”，模型只有 $d$ 个槽位。superposition 的观点是：远多于 $d$ 的 feature 能放进同一个 $d$ 维空间，只要每次实际激活的 feature 足够少，方向之间的干扰就能被控制。

SAE 做的是反向工程：

> 模型已经把很多 feature 叠在 activation space 里；SAE 尝试把这些叠加方向变成可读、可排序、可干预的对象。

过完备不是多余复杂度；它给 SAE 足够的候选方向，让 polysemantic neuron 有机会被拆成更接近单义的 feature direction。后续实验需要检验这些方向能否稳定解释 activation，并在干预时产生预测中的行为变化。

## 4. 为什么稀疏性有用

过完备会带来分解不唯一。同一个 $x$ 可以写成两个强 feature 的组合：

$$
x\approx 2.3d_{17}+0.8d_{203}
$$

也可以写成很多弱 feature 的组合：

$$
x\approx 0.1d_1+0.1d_2+\cdots+0.1d_{50}
$$

后者也许能重构，但很难解释。SAE 用 $L_1$ 惩罚偏好前者。

一个一维例子能看清 $L_1$ 的作用。若输入在某个方向上的投影为 $a$，要求解：

$$
\min_h\frac{1}{2}(a-h)^2+\lambda |h|
$$

其解是 soft-thresholding：

$$
h^*=\operatorname{sign}(a)\max(|a|-\lambda,0)
$$

若再要求 $h\ge 0$，类似 ReLU-SAE，则为：

$$
h^*=\max(a-\lambda,0)
$$

$L_1$ 在这里产生阈值效果：弱相关 feature 被压成 0，强相关 feature 保留下来但幅度被收缩。

稀疏性提供的是诊断集中度，而非纯数学简洁。dense 表示里几乎每个 feature 都参与，解释会变成“什么都有一点”；sparse 表示里只有少数 feature 激活，解释才能集中到当前状态的主要因素上。

## 5. Decoder 列为什么叫 feature direction

因为 decoder 重构是：

$$
\hat{x}=b_{\mathrm{dec}}+h_1d_1+h_2d_2+\cdots+h_md_m
$$

如果只有第 $j$ 个 feature 激活：

$$
h_j>0,\qquad h_{k\ne j}=0
$$

则：

$$
\hat{x}=b_{\mathrm{dec}}+h_jd_j
$$

$d_j$ 是 activation space 中的一个方向。它的语义通常不能从公式里直接读出，需要通过高激活样本来命名：找出哪些 token、上下文或文本片段让 $h_j(x)$ 特别大。

例如某个 feature 在这些上下文里高激活：

```text
def foo(x):
for i in range
class MyModel
return value
```

研究者可能把它解释成 Python code feature。这个命名只是第一阶段的诊断信号；它要成为机制结论，还需要在固定上下文和固定读出路径下做干预验证。

## 6. SAE 和 sparse coding 的关系

如果只看 decoder，SAE 很像字典学习：

$$
x\approx Dh,\qquad D=W_{\mathrm{dec}}
$$

理想情况下，对每个输入 $x$，可以直接解一个 sparse coding / LASSO 问题：

$$
h^*(x)=\arg\min_h\left(\lVert x-Dh\rVert_2^2+\lambda\lVert h\rVert_1\right)
$$

但每个 token、每层、每次都现场优化 $h$ 太慢。SAE 的 encoder 学的是一个快速近似：

$$
h=f_\theta(x)\approx h^*(x)
$$

SAE 由两部分构成：

$$
\boxed{
\mathrm{SAE}=\mathrm{dictionary\ learning}+\mathrm{amortized\ sparse\ inference}
}
$$

decoder 给出字典，encoder 学会快速查字典。机制可解释性关心的是这个字典能否把原本混在一起的内部因素拆得更清楚，并且这种拆分能否支持稳定的预测和干预。

## 7. 几何直觉：用少数锥形区域解释 activation

ReLU-SAE 中 $h_j\ge 0$：

$$
\hat{x}-b_{\mathrm{dec}}=\sum_jh_jd_j
$$

这是若干方向的非负线性组合。如果当前只激活 $d_2,d_7,d_{19}$，则：

$$
\hat{x}-b_{\mathrm{dec}}\in\operatorname{cone}(d_2,d_7,d_{19})
$$

当前 activation 落在这几个方向张成的局部锥形区域里。不同输入会选择不同 active set：

$$
S(x)=\{j:h_j(x)>0\}
$$

然后用：

$$
x\approx b_{\mathrm{dec}}+\sum_{j\in S(x)}h_jd_j
$$

来解释。

SAE 可能拆出“概念”，靠的是一个结构假设：模型内部状态是组合式的，一个 token 位置通常只涉及少数当前相关因素。看到一段递归 Python 代码时，activation 可能同时包含 Python、函数定义、递归、base case、变量绑定，但不应强烈包含无关主题。

SAE 把这个假设写进了模型：当前 activation 应该能由少数潜在 feature 组合出来。

## 8. 理论分析：什么时候能识别出 feature

SAE 的理论目标可由一个局部稀疏生成模型刻画。假设某层 activation 近似来自一组真实但未知的方向：

$$
x=b+D_*s+\epsilon
$$

其中 $D_*=[d_1^*,\ldots,d_r^*]$ 是真实 feature dictionary，$s$ 是稀疏系数，$\epsilon$ 是模型中未被该字典解释的残差。关键假设是：

$$
\lVert s\rVert_0\le k,\qquad k\ll r
$$

该假设允许模型内部存在大量潜在 feature，同时要求每个 token 位置只激活其中很少一部分。SAE 的训练同时学习 dictionary $D$ 和快速推断器 $f_\theta$：

$$
D,\theta
\quad\text{使得}\quad
x\approx b+Df_\theta(x-b),
\qquad
\lVert f_\theta(x-b)\rVert_0\ \text{较小}
$$

如果先固定 dictionary，只考虑给定 $D$ 后如何分解 $x$，理想问题是：

$$
h^*(x)=
\operatorname*{argmin}_h
\left(
\lVert x-b-Dh\rVert_2^2+\lambda\lVert h\rVert_1
\right)
$$

encoder 的理论角色接近 amortized sparse inference module，而非“压缩器”：它用一次前向传播近似求解 sparse coding 问题。

为了理解什么时候这种分解有希望稳定，可以看 dictionary 的互相干扰程度。定义 decoder directions 的 mutual coherence：

$$
\mu(D)=\max_{i\ne j}
\frac{|d_i^\top d_j|}
{\lVert d_i\rVert_2\lVert d_j\rVert_2}
$$

$\mu(D)$ 越小，不同 feature direction 越不相似。经典稀疏恢复给出的判断是：当真实 active set 足够小、dictionary 方向不太相干、残差 $\epsilon$ 不太大时，稀疏解更可能恢复正确 support。一个常见形式的充分条件是：

$$
k < \frac{1}{2}\left(1+\frac{1}{\mu(D)}\right)
$$

这个条件不能直接套到真实 LLM 上；它提供的是 SAE 的理论诊断边界。feature 方向高度相干，或者一个行为必须由很多 feature 同时表达时，单个 feature 的解释会变得不稳定。此时的 feature splitting、多个相似 latent、intervention 效果分散，不一定是训练瑕疵；它们也可能暴露底层机制并非单方向可分。

SAE 的可解释性依赖三项条件：

1. activation 确实近似稀疏组合。
2. dictionary 中的候选方向相互区分度足够高。
3. encoder 学到的 support 接近真实 active set。

三项条件分别对应重构、稀疏和可识别性。Dense dictionary 也能重构，相似 feature 也会共享高激活样本；机制证据需要把 support 稳定性和干预结果接起来。

## 9. 理论分析：干预为什么能测试机制

SAE feature 是否有机制意义，取决于后续网络是否读取了这个方向。把某层 activation 到最终 logits 或行为读数的后续计算写成：

$$
z=F(x)
$$

若对第 $j$ 个 feature 做 activation steering，可以近似写成：

$$
x' = x+\alpha d_j
$$

则 logits 的一阶变化为：

$$
\Delta z
=F(x+\alpha d_j)-F(x)
\approx
\alpha J_F(x)d_j
$$

其中 $J_F(x)$ 是后续网络在 $x$ 处的 Jacobian。这个式子给出一个清晰判据：如果 $J_F(x)d_j$ 在目标行为相关的 logit 方向上很大，该 feature 既可读，也被后续计算读取；如果 $J_F(x)d_j$ 接近 0，那么即使该 feature 的语义命名很漂亮，它也可能只是当前层的相关标记。

进一步看 ablation。若把某个激活置零：

$$
h_j\leftarrow 0
$$

对应的 activation 变化近似是：

$$
\Delta x\approx -h_jd_j
$$

于是：

$$
\Delta z\approx -h_jJ_F(x)d_j
$$

同一个 feature 在不同上下文里可能产生不同干预效果：$h_j$ 表示该 feature 当前暴露得多强，$J_F(x)d_j$ 表示后续网络当前是否读取该方向。前者是 feature exposure，后者是 downstream sensitivity。只有二者同时较大，干预才会产生明显行为变化。

SAE 的机制诊断链为：

$$
\text{sparse support}
\Rightarrow
\text{interpretable direction}
\Rightarrow
\text{downstream sensitivity}
\Rightarrow
\text{behavioral effect}
$$

失败案例也可以沿这条链定位。若 feature 可读但干预无效，瓶颈可能在 downstream sensitivity；若 steering 改变了很多无关行为，问题可能是方向相干或 feature splitting；若相同 feature 在不同层效果相反，则说明后续读出协议不同，不能把它当成全局开关。

## 10. TopK SAE：把稀疏性写成硬约束

有些 SAE 不用 $L_1$ 惩罚，而是直接只保留最大的 $k$ 个激活：

$$
h=\operatorname{TopK}(W_{\mathrm{enc}}x+b_{\mathrm{enc}},k)
$$

形式上：

$$
h_j=
\begin{cases}
z_j, & z_j\text{ 是前 }k\text{ 大激活之一}\\
0, & \text{否则}
\end{cases}
$$

普通 $L_1$-SAE 是软稀疏：

$$
\lambda\lVert h\rVert_1
$$

TopK SAE 是硬稀疏：

$$
\lVert h\rVert_0\le k
$$

TopK 给 SAE 一本很大的 feature 字典，同时限制每个 activation 最多只能用 $k$ 个词解释。这种硬约束直接控制每次解释的 feature 数量，也能简化稀疏度调参。[Scaling and evaluating sparse autoencoders](https://arxiv.org/abs/2406.04093) 这类工作就使用 k-sparse autoencoders 研究 autoencoder size 和 sparsity 的 scaling laws。

## 11. 从可读 feature 到机制诊断

SAE feature 更可读，不等于它们自动就是真实机制。更稳的读法是把 SAE 当成一条诊断链：

| 阶段 | 问题 | 典型证据 |
| --- | --- | --- |
| feature discovery | 这个方向能否重构 activation 中的稳定结构 | reconstruction loss、稀疏度、dead latent 比例 |
| feature interpretation | 这个方向对应什么语义或功能 | top activating examples、logit lens、相关 token/context |
| feature intervention | 改变这个方向是否改变目标行为 | ablation、activation steering、下游 logits 或行为变化 |

前两个阶段给出可读假设，第三个阶段给出机制证据。SAE 的主张不应停在“这个 feature 看起来像某概念”，还要推进到“在周围协议固定时，改变这个 feature 会产生可预测变化”。

“阶段可识别干预”要求固定 prompt、模型、层位置、读出方式和评估目标，只改变某个 feature 或一组 feature。干预成功时，结论指向该 feature 参与了当前行为，而不是泛泛的“SAE 有用”；干预失败时，瓶颈被定位到 feature 暴露、下游读取或组合效应等环节。

几个常见边界需要分开看：

| 问题 | 含义 | 影响 |
| --- | --- | --- |
| scale degeneracy | $h_jd_j=(ch_j)(d_j/c)$ | 若不约束 decoder norm，模型可能通过放大 $d_j$、压小 $h_j$ 来绕开 $L_1$ |
| dead latents | 某些 feature 几乎永不激活 | 名义 feature 数大于实际可用容量 |
| feature splitting | 一个概念被拆成多个相似 feature | 可能来自容量过大、正则不合适，也可能说明概念本来有细粒度子结构 |
| false interpretability | feature 名称看似合理，但未必因果控制行为 | 需要固定协议下的 intervention 验证 |

最后一项尤其容易被误读。一个 feature 在医学文本中高激活，不代表它因果控制医学回答；一个 feature 的 top activating examples 都像 Python 代码，也不代表它是模型写代码能力的唯一开关。

验证应落到干预上：

$$
h_j\leftarrow 0
\qquad\text{或}\qquad
h_j\leftarrow h_j+\alpha
$$

随后观察模型输出、logits、下游行为是否按预期改变。若干预产生预期变化，说明该 feature 是当前行为链中的有效环节；若变化很小，诊断信号也有意义：该 feature 可能只是相关标记，瓶颈可能在 feature 暴露、下游读取或多个 feature 的组合效应上。

## 12. 四层理解 SAE

SAE 有四层。

第一层是重构层。SAE 必须保留原 activation 的信息：

$$
\hat{x}\approx x
$$

否则它只是一个表面解释系统。

第二层是稀疏层。SAE 必须避免所有 feature 都参与：

$$
\lVert h\rVert_0\ll m
$$

否则解释会退化成密集混合。

第三层是语义层。研究者希望每个 $d_j$ 尽量对应某个可理解概念，例如 URL、数学证明、Python docstring、法语文本、拒答语气等。loss 本身不保证这种对应关系；真实数据的组合结构、模型内部的 superposition、过完备字典、非负激活和稀疏约束共同诱导出语义对齐。

第四层是干预层。只有当 feature 的改变能在固定协议下带来可预测输出变化时，它才从“可读表示”进一步变成“机制证据”。

把完整公式放在一起，可以写成：

$$
\tilde{x}_i=x_i-b_{\mathrm{dec}}
$$

$$
h_i=\operatorname{ReLU}(W_{\mathrm{enc}}\tilde{x}_i+b_{\mathrm{enc}})
$$

$$
\hat{x}_i=b_{\mathrm{dec}}+W_{\mathrm{dec}}h_i
$$

$$
\mathcal{L}
=
\frac{1}{N}\sum_i
\left[
\lVert x_i-\hat{x}_i\rVert_2^2+\lambda\lVert h_i\rVert_1
\right]
$$

若加入 decoder column 归一化，则通常还会约束：

$$
\lVert d_j\rVert_2=1,\qquad j=1,\ldots,m
$$

## 总结

SAE 可以总结为：

> 在 activation 空间里学习一套过完备 feature 字典，让每个 activation 都能用少数 feature direction 重构，并把这些 direction 转化为可检验的机制假设。

它的机制主干是：

$$
\boxed{
x\approx b_{\mathrm{dec}}+\sum_{j\in S(x)}h_jd_j,\qquad |S(x)|\ll m
}
$$

重构项保证 SAE 没有丢掉原模型信息；稀疏项让解释集中在少数 feature；过完备字典给模型足够多的候选语义方向；固定协议下的干预实验则用来区分“看起来相关”和“确实参与因果控制”。

最短地说：

$$
\boxed{
\text{SAE = 用稀疏字典学习反解大模型 activation 里的 superposition}
}
$$
