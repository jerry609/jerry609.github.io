export interface TodoItem {
    title: string
    type: 'blog' | 'concept' | 'other'
    status: 'todo' | 'done' | 'in-progress'
    link?: string
    tags?: string[]
}

export interface DailyPlan {
    date: string
    items: TodoItem[]
}

export const plans: DailyPlan[] = [
    {
        date: '2025-11-30',
        items: [
            {
                title: '搭建 Claude Code 生态项目博客',
                type: 'blog',
                status: 'done',
                link: '/blog/claude-code-ecosystem',
                tags: ['Claude', 'Blog', 'Setup']
            },
            {
                title: '创建 Murmurs 页面',
                type: 'other',
                status: 'done',
                link: '/murmurs',
                tags: ['Feature', 'Astro']
            }
        ]
    }
]
