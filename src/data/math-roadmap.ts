/**
 * Math toolkit study path, derived from /blog/math-toolkit-collection.
 * Rendered as the 学习路线 section of /math-notes. Items link to the posts that cover them.
 */
import type { Section } from './algorithms/topics'

export const MATH_ROADMAP: Section = {
  "title": "数学工具集合",
  "desc": "来源页面：/blog/math-toolkit-collection。这里把那篇索引做成可勾选 roadmap。\n\n统计口径：一个工具 = 有明确输入、输出、用途，可以封装成独立函数或模块。不把“标量、向量、矩阵”这类数据类型算作工具。\n\n总纲：数学围绕可推出性运转，用定义制造对象，用假设限定世界，用证明管理结论，用反例划定边界。\n\n主线：线性代数 -> 最小二乘 -> Ridge -> LASSO -> 凸优化 / 对偶 / KKT -> 算法与现代模型解释。\n\n推荐走法：先看现代数学总纲和主线地图，再完成 22 个核心工具，最后按 A-E 五组扩展到 58 个原子工具。",
  "children": [
    {
      "title": "现代数学总纲",
      "desc": "用“可推出性”看数学：对象集合 + 约束条件，经由证明推出必然结论或结构。定义负责制造对象，假设负责限定世界，证明负责管理必然性，反例负责划定边界。",
      "problems": [
        {
          "id": "G01",
          "title": "运转链条：语言与逻辑 -> 对象与定义 -> 公理与假设 -> 命题网络 -> 反例边界",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G02",
          "title": "概念七问：对象、动机、消除、保留、约束、推出、边界",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G03",
          "title": "公式五维：量纲、尺度、不变量、优化、信息 / 概率",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G04",
          "title": "数学价值观：假设代价与结论强度",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G05",
          "title": "代数学：对运算规则施加约束",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G06",
          "title": "分析学：对无限与极限施加约束",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G07",
          "title": "几何与拓扑：对空间形态施加约束",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "G08",
          "title": "概率与统计：对不确定性施加约束",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "主线地图",
      "desc": "把整套体系压缩成一条研究路线：用线性组合表示数据 x≈Dh，先用最小二乘追求拟合，再用 Ridge 处理不稳定，用 LASSO 追求稀疏和特征选择，最后进入次梯度、KKT、对偶和近端算法。记忆法：最小二乘是“我要拟合好”；Ridge 是“我要拟合好，而且系数不要太大”；LASSO 是“我要拟合好，而且只用少数特征”；对偶/KKT 是“我要知道约束和惩罚为什么相关，以及最优解长什么样”。",
      "problems": [
        {
          "id": "M01",
          "title": "线性代数：理解 x≈Dh",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "M02",
          "title": "最小二乘：min_h ||x - Dh||_2^2",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "M03",
          "title": "发现问题：不稳定 / 过拟合 / 共线性",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "M04",
          "title": "Ridge：min_h ||x - Dh||_2^2 + lambda ||h||_2^2",
          "url": "/blog/ridge-regression-l2-regularization"
        },
        {
          "id": "M05",
          "title": "LASSO：min_h ||x - Dh||_2^2 + lambda ||h||_1",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "M06",
          "title": "不光滑优化：次梯度 / KKT / 对偶 / proximal algorithm",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "M07",
          "title": "应用：sparse coding / dictionary learning / SAE",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "第一版：22 个核心工具",
      "desc": "第一版先学最常用、最像“可调用函数”的工具。从最小二乘、Ridge、LASSO、soft-thresholding、坐标下降、ISTA、KKT、对偶间隙开始。",
      "problems": [
        {
          "id": "K01",
          "title": "维度检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K02",
          "title": "L1 / L2 / L0 / Frobenius 范数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K03",
          "title": "残差计算",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K04",
          "title": "平方误差",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K05",
          "title": "普通最小二乘法",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K06",
          "title": "正规方程求解",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K07",
          "title": "伪逆最小二乘",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K08",
          "title": "Ridge 回归",
          "url": "/blog/ridge-regression-l2-regularization"
        },
        {
          "id": "K09",
          "title": "LASSO",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K10",
          "title": "L0 支持集枚举",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K11",
          "title": "固定支持集最小二乘",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K12",
          "title": "Soft-thresholding",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K13",
          "title": "L1 近端算子",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K14",
          "title": "坐标下降 LASSO",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K15",
          "title": "ISTA",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K16",
          "title": "正交设计 LASSO 闭式解",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K17",
          "title": "LASSO KKT 检查",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "K18",
          "title": "拉格朗日函数构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K19",
          "title": "KKT 条件检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K20",
          "title": "Slater 条件检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K21",
          "title": "对偶间隙计算",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "K22",
          "title": "LASSO 对偶可行点构造",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "A. 基础线性代数与度量工具：12 个",
      "desc": "目标：先把 x、D、h、Dh、r = x - Dh 这些对象读顺。这里的工具是后面所有拟合、正则化和对偶推导的底座。",
      "problems": [
        {
          "id": "A01",
          "title": "维度检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A02",
          "title": "转置",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A03",
          "title": "点积 / 内积",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A04",
          "title": "向量线性组合",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A05",
          "title": "矩阵乘向量",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A06",
          "title": "矩阵乘矩阵",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A07",
          "title": "L2 范数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A08",
          "title": "L2 平方范数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A09",
          "title": "L1 范数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A10",
          "title": "L0 非零计数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A11",
          "title": "Frobenius 范数",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "A12",
          "title": "残差 / 误差向量计算：r = x - Dh",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "B. 最小二乘与矩阵求导工具：9 个",
      "desc": "目标：把“残差”变成可优化目标，并掌握普通最小二乘、正规方程、伪逆和多样本形式。",
      "problems": [
        {
          "id": "B13",
          "title": "平方误差目标构造：||x - Dh||^2",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B14",
          "title": "一维二次函数最小化",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B15",
          "title": "梯度 / 矩阵求导",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B16",
          "title": "普通最小二乘法，OLS",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B17",
          "title": "正规方程求解：D^T D h = D^T x",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B18",
          "title": "最小二乘投影 / 残差正交检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B19",
          "title": "Moore-Penrose 伪逆解",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B20",
          "title": "固定支持集最小二乘",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "B21",
          "title": "多样本最小二乘：min_H ||X - DH||_F^2",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "C. 正则化与稀疏模型工具：10 个",
      "desc": "目标：从“只拟合”进入“带偏好的拟合”：稳定、稀疏、支持集选择、多样本稀疏编码和字典学习。",
      "problems": [
        {
          "id": "C22",
          "title": "通用正则化目标构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "C23",
          "title": "Ridge 回归",
          "url": "/blog/ridge-regression-l2-regularization"
        },
        {
          "id": "C24",
          "title": "LASSO 惩罚形式",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "C25",
          "title": "LASSO 约束形式",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "C26",
          "title": "基追踪去噪，Basis Pursuit Denoising",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "C27",
          "title": "L0 稀疏优化 / 支持集枚举",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "C28",
          "title": "支持集 / 稀疏度提取",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "C29",
          "title": "正交设计下的 LASSO 闭式解",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "C30",
          "title": "多样本 LASSO / 稀疏编码",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "C31",
          "title": "字典学习",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "D. 凸优化、非光滑优化与算法工具：11 个",
      "desc": "目标：处理 LASSO 这类非光滑凸优化问题，掌握子梯度、soft-thresholding、近端算子、坐标下降和 ISTA。",
      "problems": [
        {
          "id": "D32",
          "title": "凸集 / 凸函数检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D33",
          "title": "凸性组合规则：非负加权和保持凸性",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D34",
          "title": "子梯度计算器",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D35",
          "title": "绝对值函数子梯度",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D36",
          "title": "L1 范数子梯度",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D37",
          "title": "LASSO 最优性条件检查",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "D38",
          "title": "Soft-thresholding 软阈值算子",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "D39",
          "title": "L1 近端算子",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "D40",
          "title": "坐标下降法求 LASSO",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "D41",
          "title": "ISTA，迭代软阈值算法",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "D42",
          "title": "Lipschitz 步长选择",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    },
    {
      "title": "E. 拉格朗日、KKT、对偶与证书工具：16 个",
      "desc": "目标：理解约束、惩罚、对偶下界、强对偶、KKT 和最优性证书。这组工具回答“为什么这个解是最优的”。",
      "problems": [
        {
          "id": "E43",
          "title": "拉格朗日函数构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E44",
          "title": "等式约束拉格朗日乘子法",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E45",
          "title": "不等式约束 KKT 求解",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E46",
          "title": "对偶函数构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E47",
          "title": "对偶问题构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E48",
          "title": "弱对偶下界计算",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E49",
          "title": "对偶间隙计算",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E50",
          "title": "Slater 条件检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E51",
          "title": "通用 KKT 系统检查",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E52",
          "title": "硬约束到惩罚项转换",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E53",
          "title": "LASSO 对偶问题构造",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "E54",
          "title": "LASSO 对偶的投影形式",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "E55",
          "title": "原变量—对偶变量关系转换：LASSO 对偶变量 = 最优残差",
          "url": "/blog/lasso-textbook"
        },
        {
          "id": "E56",
          "title": "Fenchel 共轭计算",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E57",
          "title": "Fenchel 对偶构造",
          "url": "/blog/math-toolkit-collection"
        },
        {
          "id": "E58",
          "title": "从残差构造对偶可行点 / 最优性证书",
          "url": "/blog/math-toolkit-collection"
        }
      ]
    }
  ]
}
