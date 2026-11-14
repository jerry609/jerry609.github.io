/**
 * Math notes page data. Each note shows its signature equation, copied verbatim from the
 * post (keep it that way: only use a formula that appears in the post itself).
 * `code` / `outline` cards are for notes without a central formula.
 */
export type NoteCard =
  | { slug: string; eq: string }
  | { slug: string; code: string }
  | { slug: string; outline: string[] }

export type Track = { id: string; en: string; zh: string; desc: string; notes: NoteCard[] }

export const TRACKS: Track[] = [
  {
    id: 'probability',
    en: 'Probability & Statistics',
    zh: '概率与统计',
    desc: '从误差模型推出正态分布，从极大似然推出最小二乘，再把高斯分布用到连续动作的策略上。',
    notes: [
      {
        slug: 'normal-distribution-derivation',
        eq: String.raw`f(x)=\frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}`
      },
      {
        slug: 'least-squares-mle-likelihood',
        eq: String.raw`J(w)=\sum_{i=1}^N \left(y_i-f(x_i; w)\right)^2`
      },
      {
        slug: 'gaussian-policy-maximum-entropy',
        eq: String.raw`a\mid s \sim \mathcal{N}\bigl(\mu_\theta(s),\sigma_\theta(s)^2\bigr)`
      }
    ]
  },
  {
    id: 'linear',
    en: 'Linear Models & Regularization',
    zh: '线性模型与正则化',
    desc: '最小二乘之后加上 L2 和 L1：Ridge 的闭式解、LASSO 的稀疏性，以及背后的凸优化工具。',
    notes: [
      {
        slug: 'math-toolkit-collection',
        eq: String.raw`\text{拟合} \rightarrow \text{稳定} \rightarrow \text{稀疏} \rightarrow \text{可解释} \rightarrow \text{可计算}`
      },
      {
        slug: 'ridge-regression-l2-regularization',
        eq: String.raw`h^\star=\arg\min_h \left[ \frac{1}{2}\|x-Dh\|_2^2 + \frac{\lambda}{2}\|h\|_2^2 \right]`
      },
      // The post is a PDF textbook framed around x ≈ Dh
      { slug: 'lasso-textbook', eq: String.raw`x \approx Dh` }
    ]
  },
  {
    id: 'information',
    en: 'Information & Projections',
    zh: '信息论与分布投影',
    desc: '把 SFT 和 RL 都写成分布上的 KL 投影；用熵和单纯形几何解释 softmax 与注意力。',
    notes: [
      {
        slug: 'sft-forward-kl-formal-modeling',
        eq: String.raw`L_{\mathrm{SFT}}(\pi) = C_Q + \sum_{s\in\mathcal S} d_Q(s) D_{\mathrm{KL}} \left( \mu_Q(\cdot\mid s) \Vert \pi(\cdot\mid s) \right)`
      },
      {
        slug: 'rl-reward-tilting-kl-regularized-projection',
        eq: String.raw`P^\star(y\mid x) = \frac{P_{\mathrm{ref}}(y\mid x)\exp(R(x,y)/\beta)}{Z_\beta(x)}`
      },
      {
        slug: 'softmax-geometric-essence',
        eq: String.raw`p_i = \frac{\exp(z_i)} {\sum_{j=1}^{n}\exp(z_j)}`
      },
      {
        slug: 'attention-entropy-dynamic-topology',
        eq: String.raw`H_t^{(\ell,h)} = - \sum_{i\in\Omega_t} a_{ti}^{(\ell,h)} \log\left(a_{ti}^{(\ell,h)}+\varepsilon\right)`
      }
    ]
  },
  {
    id: 'dynamics',
    en: 'Optimization & Dynamics',
    zh: '优化与训练动力学',
    desc: '谱半径、随机矩阵连乘与 Lyapunov 指数，用来解释深层网络的梯度传播和 warmup。',
    notes: [
      {
        slug: 'spectral-radius-to-random-jacobian-products',
        eq: String.raw`\rho(A) = \lim_{n\to\infty}\|A^n\|^{1/n}`
      },
      {
        slug: 'post-ln-warmup-layernorm-gradient',
        eq: String.raw`x_{l+1} = \operatorname{LN}\bigl(x_l+F_l(x_l)\bigr)`
      }
    ]
  },
  {
    id: 'writing',
    en: 'Writing Toolkit',
    zh: '论文写作素材',
    desc: '写理论和机制型论文时反复用到的 LaTeX 环境、定理模板与表述。',
    notes: [
      {
        slug: 'machine-learning-theory-latex-template-library',
        code: String.raw`\begin{theorem}[Informal]
Under sufficiently small initialization, …
\end{theorem}`
      },
      {
        slug: 'transformer-llm-mechanism-paper-writing-library',
        outline: ['题目', '摘要', 'Introduction', '理论与机制分析', '实验', '结论']
      }
    ]
  }
]

export const PDFS = [
  { file: 'rope-lecture.pdf', title: 'RoPE 讲义', note: '41 页，从问题到工程实践', size: '1.0 MB', post: 'rope-lecture' },
  { file: 'rl-textbook.pdf', title: '强化学习自学教程', note: '从表格方法到大模型对齐', size: '356 KB', post: 'rl-textbook-from-tabular-to-alignment' },
  { file: 'grpo-textbook.pdf', title: 'GRPO 教材', note: '理解 GRPO 的 7 个元维度', size: '736 KB', post: 'grpo-seven-dimensions' },
  { file: 'lasso-textbook.pdf', title: 'LASSO 教材', note: '稀疏表示与凸优化', size: '384 KB', post: 'lasso-textbook' }
]

/**
 * "第一版：22 个核心工具" → the atomic tools (A–E) each one covers.
 * The core list uses short names ("ISTA") and one item spans several norms,
 * so the mapping is written out instead of matched by title.
 */
export const CORE_MAP: Record<string, string[]> = {
  K01: ['A01'], // 维度检查
  K02: ['A07', 'A09', 'A10', 'A11'], // L1 / L2 / L0 / Frobenius 范数
  K03: ['A12'], // 残差计算
  K04: ['B13'], // 平方误差
  K05: ['B16'], // 普通最小二乘法
  K06: ['B17'], // 正规方程求解
  K07: ['B19'], // 伪逆最小二乘
  K08: ['C23'], // Ridge 回归
  K09: ['C24'], // LASSO
  K10: ['C27'], // L0 支持集枚举
  K11: ['B20'], // 固定支持集最小二乘
  K12: ['D38'], // Soft-thresholding
  K13: ['D39'], // L1 近端算子
  K14: ['D40'], // 坐标下降 LASSO
  K15: ['D41'], // ISTA
  K16: ['C29'], // 正交设计 LASSO 闭式解
  K17: ['D37'], // LASSO KKT 检查
  K18: ['E43'], // 拉格朗日函数构造
  K19: ['E51'], // KKT 条件检查
  K20: ['E50'], // Slater 条件检查
  K21: ['E49'], // 对偶间隙计算
  K22: ['E58'] // LASSO 对偶可行点构造
}
