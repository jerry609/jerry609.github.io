import { createClient } from '@supabase/supabase-js'

// 从环境变量获取 Supabase 配置
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Progress persistence will be disabled.')
}

// 创建 Supabase 客户端
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

// 题目进度数据类型
export interface ProblemProgress {
    problem_id: string
    completed: boolean
    completed_at?: string
    updated_at?: string
}

// 进度统计类型
export interface ProgressStats {
    total: number
    completed: number
    percentage: number
}

/**
 * 获取所有题目的完成进度
 * @returns 题目进度映射 (problem_id -> completed)
 */
export async function getProblemProgress(): Promise<Map<string, boolean>> {
    if (!supabase) {
        return new Map()
    }

    try {
        const { data, error } = await supabase
            .from('problem_progress')
            .select('problem_id, completed')

        if (error) {
            console.error('Error fetching problem progress:', error)
            return new Map()
        }

        const progressMap = new Map<string, boolean>()
        data?.forEach((item) => {
            progressMap.set(item.problem_id, item.completed)
        })

        return progressMap
    } catch (err) {
        console.error('Exception fetching problem progress:', err)
        return new Map()
    }
}

/**
 * 更新单个题目的完成状态
 * @param problemId 题目ID
 * @param completed 是否完成
 */
export async function updateProblemStatus(
    problemId: string,
    completed: boolean
): Promise<boolean> {
    if (!supabase) {
        console.warn('Supabase client not initialized')
        return false
    }

    try {
        const { error } = await supabase
            .from('problem_progress')
            .upsert(
                {
                    problem_id: problemId,
                    completed: completed,
                    completed_at: completed ? new Date().toISOString() : null,
                },
                {
                    onConflict: 'problem_id',
                }
            )

        if (error) {
            console.error('Error updating problem status:', error)
            return false
        }

        return true
    } catch (err) {
        console.error('Exception updating problem status:', err)
        return false
    }
}

/**
 * 获取进度统计信息
 * @param totalProblems 总题目数
 * @returns 进度统计
 */
export async function getProgressStats(totalProblems: number): Promise<ProgressStats> {
    if (!supabase) {
        return { total: totalProblems, completed: 0, percentage: 0 }
    }

    try {
        const { data, error } = await supabase
            .from('problem_progress')
            .select('completed')

        if (error) {
            console.error('Error fetching progress stats:', error)
            return { total: totalProblems, completed: 0, percentage: 0 }
        }

        const completed = data?.filter((item) => item.completed).length || 0
        const percentage = totalProblems > 0 ? Math.round((completed / totalProblems) * 100) : 0

        return {
            total: totalProblems,
            completed,
            percentage,
        }
    } catch (err) {
        console.error('Exception fetching progress stats:', err)
        return { total: totalProblems, completed: 0, percentage: 0 }
    }
}
