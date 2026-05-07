---
title: '从线性代数到 LASSO：公式展开、推导与计算过程完整教材'
description: '一份面向新手与进阶读者的 LASSO 教材，沿线性代数、最小二乘、稀疏表示、子梯度、soft-thresholding、坐标下降与 ISTA 展开。'
publishDate: '2026-05-07'
tags: ['LASSO', '线性代数', '最小二乘', '稀疏表示', '凸优化', '机器学习', '教材']
language: 'zh-CN'
draft: false
---

# 从线性代数到 LASSO：公式展开、推导与计算过程完整教材

> 一份把 `x ≈ Dh`、最小二乘和 LASSO 从“公式黑盒”拆成可手算、可解释、可推导对象的教材。

<iframe
  src="/pdf/lasso-textbook.pdf#view=FitH"
  title="从线性代数到 LASSO：公式展开、推导与计算过程完整教材"
  width="100%"
  height="820"
  loading="lazy"
  style="border: 1px solid #e0e0e0; border-radius: 8px; min-height: 72vh;"
></iframe>

下载 PDF：[从线性代数到 LASSO](/pdf/lasso-textbook.pdf)

---

## 目录概览

| 部分 | 内容 |
| --- | --- |
| 第一部分：看懂公式 | 标量、向量、矩阵、范数、矩阵乘法、误差、最小二乘、`arg min` 与梯度 |
| 第二部分：从最小二乘到稀疏表示 | `L0` 稀疏优化、正则化、Ridge、LASSO、凸性、子梯度与最优性条件 |
| 第三部分：综合例题、扩展与实践 | soft-thresholding、正交设计、坐标下降、ISTA、`L1` 与 `L2` 几何差异 |
| 第四部分：附录 | 矩阵求导速查、练习题与答案、总结 |

## 适合怎么读

- 如果是第一次接触 LASSO，可以先顺着第一部分建立线性代数和最小二乘直觉。
- 如果已经熟悉基础公式，可以从第二部分进入稀疏表示、`L1` 正则化和最优性条件。
- 如果关心算法实现，可以重点读 soft-thresholding、坐标下降和 ISTA 几章。

## 一句话总结

LASSO 的核心不只是“加一个 `L1` 惩罚项”，而是用可计算的凸优化形式，把拟合误差和稀疏偏好放进同一个目标函数里。
