---
title: '机器学习理论论文 LaTeX 通用素材库'
description: '整理 10 个机器学习理论论文中常用的 LaTeX 写法，覆盖研究问题、定义、定理、引理、公式解释和正文过渡。'
publishDate: '2026-04-28'
tags: ['LaTeX', '机器学习', '论文写作', '模板']
language: 'zh-CN'
draft: false
---

# 机器学习理论论文 LaTeX 通用素材库

这是一组可以直接复制到机器学习理论论文里的 LaTeX 写作素材。

它不是完整论文模板，而是更小粒度的“句式 + 环境 + 排版”片段，适合在写 introduction、definition、theorem、lemma、proof 和公式解释时快速复用。

使用时建议先关注三件事：

1. **先明确功能**：这个片段是用来提出问题、定义对象、陈述结论，还是解释公式。
2. **再替换符号**：保留叙述结构，把变量、矩阵、误差项替换成自己的对象。
3. **最后统一风格**：同一篇论文里的 theorem、lemma、proof 和强调框要保持一致。

> 说明：下方每个小节都包含源码和编译预览。`\questionbox`、`\Mask`、`\DM` 等命令是示例中的自定义宏，实际使用时可以换成你论文里的宏定义。

---

## 素材总览

| 编号 | 类型 | 适合场景 |
| --- | --- | --- |
| 01 | 强调性研究问题 | 引言末尾、problem statement |
| 02 | 定义环境 | 定义模型、对象、递推结构 |
| 03 | 主结果定理 | 陈述核心上界、分解结论、阶段性结论 |
| 04 | 短引理 | 证明链中的局部工具结论 |
| 05 | 引理与证明 | 用 2--3 句说明关键因果链 |
| 06 | 行内小标题 | 在一节内部切换叙述焦点 |
| 07 | 编号式加粗说明 | 拆解 theorem 或公式中的多个成分 |
| 08 | 粗斜体强调句 | 段首总结机制或核心观察 |
| 09 | 公式后立即解释 | 先给公式，再解释每个符号的功能 |
| 10 | 由公式过渡到定理 | 公式、直觉解释、theorem 的自然衔接 |

---

## 01. Boxed question / 强调性研究问题

用于把核心研究问题单独拎出来，形成视觉停顿。适合引言末尾或 problem statement。

```latex
\questionbox{How do semantic associations emerge during the training of attention-based language models on natural language data?}
```

![Boxed question / 强调性研究问题](./01_boxed_question.png)

---

## 02. Definition + displayed equations / 定义环境

先定义对象，再给递推公式，最后补符号解释。是理论论文中很常见的定义写法。

```latex
\begin{definition}[Attention-Based Transformer]
Given an input matrix $X \in \mathbb{R}^{T \times |\mathcal V|}$ and parameters $\Theta$, define
\begin{equation}
F_{\Theta}(X)=h^{(L)}W_O,
\end{equation}
where
\begin{equation}
h^{(l)} = h^{(l-1)} +
S\!\left(\Mask\!\left(h^{(l-1)}W^{(l)}h^{(l-1)\top} + \DM(P^{(l)})\right)\right)
h^{(l-1)}V^{(l)},
\qquad
h^{(0)} = X.
\end{equation}
Here, $S(\cdot)$ denotes softmax, $\DM(\cdot)$ maps a vector to a relative-position bias matrix, and $\Mask(\cdot)$ applies the causal mask.
\end{definition}
```

![Definition + displayed equations / 定义环境](./02_definition_transformer.png)

---

## 03. Theorem + align / 主结果定理

把主结果压缩为并列不等式组，再用一句话解释各项含义。适合 early-stage training、误差上界、分解结论等场景。

```latex
\begin{theorem}[Informal]
Under sufficiently small initialization, after $s$ gradient-descent steps with learning rate $\eta$, the early-stage parameters satisfy
\begin{align}
\|W_O - s\eta \bar B\|_F &\le 3 s^2 \eta^2, \\
\left\|V^{(l)} - \binom{s}{2}\eta^2 \bar\Phi^\top \bar B^\top\right\|_F &\le 12 s^3 \eta^3, \\
\left\|W^{(l)} - \left(3\binom{s}{4}+2\binom{s}{3}\right)\eta^4 \bar Q\right\|_F &\le 13 s^5 \eta^5 T, \\
\left\|P^{(l)} - \left(3\binom{s}{4}+2\binom{s}{3}\right)\eta^4 \Delta\right\|_F &\le 13 s^5 \eta^5 T.
\end{align}
The first term captures bigram statistics, whereas the higher-order terms capture contextual and position-dependent structure.
\end{theorem}
```

![Theorem + align / 主结果定理](./03_theorem_informal.png)

---

## 04. Short lemma / 短引理

短引理适合证明链里的技术步骤：先给一条局部可复用结论，后续在 theorem proof 中调用。

```latex
\begin{lemma}[Softmax Jacobian Norm]
Let $\sigma:\mathbb{R}^n \to \mathbb{R}^n$ be the softmax map. Then
\begin{equation}
\|J_{\sigma}(z)\|_2 \le \frac{1}{2}
\end{equation}
for every $z \in \mathbb{R}^n$.
\end{lemma}
```

![Short lemma / 短引理](./04_lemma_short.png)

---

## 05. Lemma + proof / 引理与证明

展示最常见的 proof 节奏：先写 lemma，再用 2--3 句证明核心因果链，而不是一上来堆细节。

```latex
\begin{lemma}[First Gradient Step]
After one gradient step,
\begin{equation}
W_O^{(1)} = W_O^{(0)} - \eta \nabla_{W_O}\mathcal L = \eta \bar B.
\end{equation}
\end{lemma}

\begin{proof}
At initialization all higher-order interaction terms vanish, so the gradient with respect to $W_O$ reduces to $-\bar B$. Substituting this quantity into the gradient update yields the claim.
\end{proof}
```

![Lemma + proof / 引理与证明](./05_lemma_with_proof.png)

---

## 06. Run-in paragraph heading / 行内小标题

适合在一节内部快速切换叙述焦点，不必新开 subsection。视觉上轻，但逻辑上很清楚。

```latex
\paragraph{Learning objective.}
We study the next-token prediction loss under a causal attention mask and track how its gradient reveals increasingly structured statistics over the course of training.
```

![Run-in paragraph heading / 行内小标题](./06_runin_paragraph.png)

---

## 07. Numbered inline item / 编号式加粗说明

适合拆解 theorem 中的多个成分：每一项先给标签，再给一句功能说明。

```latex
\noindent\textbf{(1) Bigram mapping $\bar B$.}
The matrix $\bar B$ summarizes adjacent token transitions and serves as the first feature learned by the output layer.
```

![Numbered inline item / 编号式加粗说明](./07_numbered_inline_item.png)

---

## 08. Bold-italic emphasis / 粗斜体强调句

适合作为段首提示语，强调接下来不是纯推导，而是机制解释或结论总括。

```latex
\noindent\textbf{\textit{Three basis functions and their composition characterize the model's early behavior.}}
```

![Bold-italic emphasis / 粗斜体强调句](./08_bold_italic_emphasis.png)

---

## 09. Formula + immediate explanation / 公式后立即解释

这是“先给公式，再逐项解释符号功能”的标准写法。对读者最友好，也最容易迁移到自己的论文里。

```latex
To formalize this intuition, we decompose the training objective as
\begin{equation}
\mathcal E = \mathcal E_{\mathrm{signal}} + \lambda \mathcal E_{\mathrm{bias}} + \gamma \mathcal E_{\mathrm{noise}}.
\end{equation}
Here, $\mathcal E_{\mathrm{signal}}$ measures predictive structure, $\mathcal E_{\mathrm{bias}}$ captures systematic positional effects, and $\mathcal E_{\mathrm{noise}}$ collects residual variability.
```

![Formula + immediate explanation / 公式后立即解释](./09_formula_with_explanation.png)

---

## 10. From decomposition to theorem / 由公式过渡到定理

展示“公式 -> 直觉解释 -> theorem”的自然过渡，特别适合理论论文正文主线。

```latex
The decomposition separates token-level statistics from positional effects, which suggests that the first nontrivial feature should appear in the output projection.

\begin{equation}
\Psi = \Psi_{\mathrm{token}} + \Psi_{\mathrm{position}}.
\end{equation}

This observation leads to the following theorem.

\begin{theorem}
Suppose the initialization scale is at most $\sigma_0$ and the learning rate is $\eta \le \eta_0$. Then the output projection recovers $\Psi_{\mathrm{token}}$ before any position-dependent parameter grows beyond order $\eta^2$.
\end{theorem}
```

![From decomposition to theorem / 由公式过渡到定理](./10_formula_to_theorem_transition.png)

---

## 最后

这组素材最适合当作写作时的“结构参考”：

- 写引言时，用 boxed question 把问题拎出来。
- 写正文时，用 definition 和 theorem 先固定对象与主结果。
- 写证明时，用 lemma 把技术步骤拆开。
- 写公式时，不只展示推导，还要立刻解释每一项在做什么。

好的理论论文不只是公式正确，还要让读者看清楚：问题是什么、对象是什么、结论靠什么成立，以及每一步推导在整条论证链里承担什么功能。
