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

SAE 给出的新视角是：在模型内部的 activation 空间里学习一套过完备、稀疏、相对可解释的 feature 字典。每个 activation 仍然保留原模型的信息，但它被改写成少数 feature direction 的组合。Superposition 因此从“很多东西混在一起”的描述，变成可命名、可排序、可干预的候选机制。

主线压成一句话：

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

这里的 $x$ 指第 $\ell$ 层第 $t$ 个 token 位置的中间状态，区别于 token、embedding 和最终 logits：

$$
x=x_{\ell,t}
$$

它可来自 residual stream、MLP output、attention output，或某个 sublayer 的 pre/post activation。后续网络则是从当前 activation 到最终 logits 或行为读数的映射：

$$
z=F_{\ell,t}(x)
$$

SAE 依赖一个弱线性表示假设：许多可解释因素在 activation space 里能被方向或低维子空间近似表示。一个线性读数写成：

$$
\mathrm{score}_j(x)=u_j^\top x+c_j
$$

如果 $\mathrm{score}_j(x)$ 很大，表示 $x$ 沿方向 $u_j$ 暴露了某类信息。后续网络不需要保存显式概念标签；权重矩阵、attention、MLP 只要能读取某些方向，就能利用这些因素。

这个视角也解释了为什么 feature 不能等同于 neuron。设标准神经元基底为 $e_1,\ldots,e_d$，真实 feature direction 为 $\phi_1,\ldots,\phi_r$，则：

$$
x\approx\sum_{j=1}^r s_j\phi_j
$$

第 $i$ 个神经元坐标是：

$$
x_i=e_i^\top x\approx\sum_{j=1}^r s_j(e_i^\top\phi_j)
$$

一个神经元坐标可能同时接收多个 feature direction 的投影；一个 feature 也可能分布在许多神经元坐标上。Neuron-level 分析看到的是坐标轴上的混合投影，SAE 试图恢复的是更接近 feature basis 的方向。

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
| $r(x)$ | SAE 未解释掉的 reconstruction residual |
| $\lambda$ | 稀疏惩罚强度 |
| $S(x)$ | 输入 $x$ 激活的 feature 集合 |
| $F$ | 从某层 activation 到后续 logits 或行为读数的映射 |
| $J_F(x)$ | 后续映射在 $x$ 处的 Jacobian |
| $\mu(D)$ | decoder directions 的 mutual coherence |

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

维度上，若 $x\in\mathbb{R}^d$，feature 数量为 $m$，则：

$$
W_{\mathrm{enc}}\in\mathbb{R}^{m\times d},
\qquad
W_{\mathrm{dec}}\in\mathbb{R}^{d\times m},
\qquad
h\in\mathbb{R}^m
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

实际分析还要保留 residual：

$$
r(x)=x-\hat{x}
$$

原 activation 更完整的分解是：

$$
x=b_{\mathrm{dec}}+\sum_{j=1}^m h_jd_j+r(x)
$$

做 feature ablation 时，通常只改变 SAE feature 部分，并保留 $r(x)$。例如去掉第 $j$ 个 feature：

$$
x_{\mathrm{abl},j}
=b_{\mathrm{dec}}+\sum_{k\ne j}h_kd_k+r(x)
=x-h_jd_j
$$

不保留 residual 会把“去掉某个 feature”的效果和“SAE 重构误差”的效果混在一起，机制实验应把这两者分开。

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

整体训练目标写成：

$$
\min_{W_{\mathrm{enc}},W_{\mathrm{dec}},b_{\mathrm{enc}},b_{\mathrm{dec}}}
\frac{1}{N}\sum_{i=1}^N
\left[
\lVert x^{(i)}-\hat{x}^{(i)}\rVert_2^2+\lambda\lVert h^{(i)}\rVert_1
\right]
$$

SAE 的目标从“尽量少维”转向“尽量少 feature”。这一区别决定了 SAE 的诊断价值：它保留原 activation 的行为信息，同时让解释集中到少数候选原因上。

只看 loss 不够。不同 $\lambda$、不同字典宽度 $m$ 会改变重构和稀疏之间的权衡。保真度常用 explained variance / fraction of variance explained 衡量：

$$
\mathrm{FVE}
=1-\frac{\sum_i\lVert x^{(i)}-\hat{x}^{(i)}\rVert_2^2}
{\sum_i\lVert x^{(i)}-\bar{x}\rVert_2^2}
$$

稀疏度由平均 $L_0$ 衡量：

$$
L_0=\frac{1}{N}\sum_{i=1}^N\lVert h^{(i)}\rVert_0
$$

每个 feature 的激活频率同样重要：

$$
p_j=\frac{1}{N}\sum_{i=1}^N\mathbf{1}\{h_j^{(i)}>0\}
$$

$p_j\approx 0$ 往往意味着 dead latent；大量 $p_j$ 很高则说明表示过密。LLM 场景还会用 activation 被 SAE 重构替换后的语言模型 loss 来衡量行为保真度，但这仍不能替代 feature-level 的命名和干预。

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

另一种分解会使用很多弱 feature：

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

理想情况下，每个输入 $x$ 都对应一个 sparse coding / LASSO 问题：

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

SAE 和 PCA 的差别也在这里。PCA 找少数正交方向来解释总体方差：

$$
\min_U
\sum_i\left\lVert (x^{(i)}-\bar{x})-UU^\top(x^{(i)}-\bar{x})\right\rVert_2^2,
\qquad
U^\top U=I
$$

PCA 的单个样本通常在多个主成分上都有投影。SAE 则允许过完备、非正交 dictionary，但要求每个样本只用少数方向：

$$
h(x)\quad\text{is sparse}
$$

PCA 更像是在找解释总体方差的坐标系；SAE 更像是在给每个 activation 找少数可组合的语义方向。机制解释通常更需要后者，因为它把单个样本的解释压到少数候选原因上。

稀疏约束还缓解了旋转不唯一性。若没有稀疏约束，对任意可逆矩阵 $R$：

$$
Dh=(DR)(R^{-1}h)
$$

同一个重构对应无穷多套 dictionary 和 code。仅靠 reconstruction loss，feature direction 没有稳定含义。稀疏约束会偏好那些让大多数 $h(x)$ 只有少数非零项的坐标系，从而让 learned dictionary 更接近可解释 feature basis。

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

固定 dictionary 后，support 选择可由 KKT 条件刻画。令 $y=x-b$，LASSO 目标为：

$$
\min_h\frac{1}{2}\lVert y-Dh\rVert_2^2+\lambda\lVert h\rVert_1
$$

设 active set 为 $A=\{j:h_j\ne 0\}$，残差为 $r=y-Dh$。对 active feature：

$$
D_A^\top r=\lambda\operatorname{sign}(h_A)
$$

对 inactive feature：

$$
|d_j^\top r|\le\lambda,\qquad j\notin A
$$

feature 是否激活，不只取决于 $d_j^\top x$ 大不大，还取决于其它已激活 feature 已经解释掉了多少 residual。SAE encoder 学到的是这个阈值选择过程的摊销近似。

分解稳定性取决于 dictionary 的互相干扰程度。定义 decoder directions 的 mutual coherence：

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

相干性之外，还要看 margin。设真实 active feature 的最小幅度为：

$$
s_{\min}=\min_{j\in S_*}|s_j|
$$

噪声与相干干扰合起来的量级可粗略写成：

$$
\eta\approx \lVert D^\top\epsilon\rVert_\infty+k\mu(D)\lVert s\rVert_\infty
$$

若 $s_{\min}$ 与 inactive feature 得分之间的间隔不足，encoder 很容易漏掉弱真实 feature，或者误激活相似 feature。一个 feature 的 top activating examples 再漂亮，也需要检查它在邻近 prompt、邻近层、邻近 SAE checkpoint 中是否稳定。

SAE 找到的是 activation 分布上的局部线性稀疏坐标，而不是证明模型的所有概念全局线性可分。若某个机制需要二阶交互：

$$
Y\approx\beta_{ab}h_ah_b
$$

单独 ablate $a$ 或 $b$ 的效果可能不稳定。此时更合理的干预单位是 feature group 或 feature circuit，而不是单一开关。

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

若对第 $j$ 个 feature 做 activation steering，近似写成：

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

如果 SAE 作用在最后 residual stream 附近，且 logits 近似为：

$$
z=W_U^\top x
$$

其中 $W_U$ 是 unembedding 矩阵，则第 $j$ 个 feature 对 token $v$ 的直接 logit 贡献为：

$$
\mathrm{LA}_{j\to v}=h_jd_j^\top W_U[:,v]
$$

对两个候选 token 的 logit difference：

$$
\mathrm{LA}_{j\to(v_1-v_2)}
=h_jd_j^\top\left(W_U[:,v_1]-W_U[:,v_2]\right)
$$

早层 SAE 不能直接依赖这条线性读数，仍要回到 $\Delta z\approx J_F(x)(h_jd_j)$，检查后续网络是否真的读取该方向。

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

失败案例也沿这条链定位。若 feature 可读但干预无效，瓶颈可能在 downstream sensitivity；若 steering 改变了很多无关行为，问题可能是方向相干或 feature splitting；若相同 feature 在不同层效果相反，则说明后续读出协议不同，不能把它当成全局开关。

因果角度下，feature 干预可写成平均因果效应。设行为读数为 $Y$，例如某个 logit difference、是否拒答、是否输出某类实体：

$$
\mathrm{ACE}_j(c_1,c_0)
=\mathbb{E}\left[Y\mid do(h_j=c_1)\right]
-\mathbb{E}\left[Y\mid do(h_j=c_0)\right]
$$

实际实验常见三类操作：ablation 把 $h_j$ 置零；clamping 把 $h_j$ 固定到某个值；steering 沿 $d_j$ 或 $h_j$ 增加一个幅度。只在相关 prompt 上有效、在无关 prompt 上无效，往往比“到处都有效”更像精细机制。大范围副作用则提示方向混入多个因素，或与其它 feature 高度相干。

单个 feature 通常不是完整机制。不同层的 feature 可作为节点，attribution 或 patching 效应可作为边：

$$
G=(V,E),\qquad
V=\{(\ell,j):\text{layer }\ell\text{ 的 feature }j\}
$$

若第 $\ell$ 层 feature $a$ 的变化会影响第 $\ell'$ 层 feature $b$，边权可近似写成：

$$
w_{a\to b}\approx
\frac{\partial h_b^{(\ell')}}{\partial h_a^{(\ell)}}
$$

机制诊断由此从“这个 feature 是否可解释”推进到“哪些 feature 构成可解释因果子图”。

## 10. TopK SAE 和常见变体

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

更一般地，不同 SAE 变体主要在调整 support 选择方式，以及激活幅度是否会被稀疏惩罚扭曲。

| 变体 | 稀疏方式 | 主要取舍 |
| --- | --- | --- |
| ReLU-L1 SAE | 用 $\lambda\lVert h\rVert_1$ 软惩罚激活 | 简单稳定，但 $L_1$ 容易压低真实幅度 |
| TopK SAE | 每个样本只保留 top-$k$ 激活 | 解释长度可控，但固定 $k$ 可能过硬 |
| BatchTopK SAE | batch 内保留前 $Bk$ 个激活 | 平均稀疏度可控，单样本可随复杂度变化 |
| Gated SAE | gate 决定 support，另一支决定 magnitude | 减少“为了稀疏而缩小幅度”的 shrinkage |
| JumpReLU SAE | 学习每个 latent 的激活阈值 | 更接近 $L_0$ 目标，但训练需要近似处理不可导阈值 |

这些变体共享同一个模板：

$$
z=f_{\mathrm{enc}}(x),\qquad
S(x)=\operatorname{Select}(z)
$$

$$
h_j=
\begin{cases}
\operatorname{Magnitude}_j(z), & j\in S(x)\\
0, & j\notin S(x)
\end{cases}
$$

机制解释不靠架构名字成立；它需要同时给出高保真、低 $L_0$、稳定 support 和有用干预。

## 11. SAE 的发展脉络

SAE 在 LLM interpretability 中变热是 2023 年以后的事，数学来源更早。早期 sparse coding 研究已经在用少数基函数解释自然图像：

$$
x\approx Da,\qquad \lVert a\rVert_0\ll m
$$

LASSO 把 $L_1$ 约束产生稀疏系数这件事系统化：

$$
\min_\beta \lVert y-X\beta\rVert_2^2+\lambda\lVert\beta\rVert_1
$$

后来的 sparse autoencoder 把每个样本现场求 sparse coding 的过程摊销成 encoder：

$$
h=f_\theta(x)
$$

2022 年的 superposition 视角把问题从“学一个稀疏表示”改写成“反解叠加表示”：模型可能用非正交方向表示多于神经元数量的 feature，只要同一时刻激活的 feature 足够少，interference 就能被控制。

2023 年以后，SAE 开始直接用于 transformer residual stream、MLP output 和 attention output。解释对象变成某层、某 token 位置内部暴露了哪些语义、语法、格式、任务或行为控制因素。2024 年之后，研究重心继续分化：更宽的 SAE、TopK / Gated / JumpReLU 等架构变体、feature circuit、开放资源、模型差异分析和跨模态表示对齐。

这条脉络有助于避免误读：SAE 并非凭空出现的“可解释性魔法”；它来自 sparse coding、dictionary learning、superposition 和 causal intervention 在 LLM activation 上的交汇。

## 12. 从可读 feature 到机制诊断

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

## 13. 四层理解 SAE

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

完整公式写成：

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

## 参考资料与延伸阅读

- [Olshausen & Field, 1996, *Emergence of simple-cell receptive field properties by learning a sparse code for natural images*](https://www.nature.com/articles/381607a0)：早期 sparse coding 代表工作。
- [Tibshirani, 1996, *Regression Shrinkage and Selection via the Lasso*](https://academic.oup.com/jrsssb/article/58/1/267/7027929)：$L_1$ 约束和稀疏选择的经典来源。
- [Makhzani & Frey, 2013, *k-Sparse Autoencoders*](https://arxiv.org/abs/1312.5663)：TopK SAE 的重要先例。
- [Elhage et al., 2022, *Toy Models of Superposition*](https://transformer-circuits.pub/2022/toy_model/index.html)：把 polysemanticity、superposition 和 sparse feature 联系起来。
- [Bricken et al., 2023, *Towards Monosemanticity*](https://transformer-circuits.pub/2023/monosemantic-features)：将 dictionary learning / SAE 用到 transformer 语言模型中。
- [Cunningham et al., 2023/2024, *Sparse Autoencoders Find Highly Interpretable Features in Language Models*](https://arxiv.org/abs/2309.08600)：在开源 LLM residual stream 上训练 SAE，并分析 feature 可解释性。
- [Anthropic, 2024, *Scaling Monosemanticity*](https://transformer-circuits.pub/2024/scaling-monosemanticity/)：将 SAE 扩展到生产级大模型并研究 feature steering。
- [Gao et al., 2024, *Scaling and evaluating sparse autoencoders*](https://arxiv.org/abs/2406.04093)：系统研究 SAE 宽度、稀疏度和 TopK scaling。
- [Marks et al., 2024, *Sparse Feature Circuits*](https://arxiv.org/abs/2403.19647)：把 SAE feature 组织成 causal graph / feature circuit。

## 总结

SAE 总结为：

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
