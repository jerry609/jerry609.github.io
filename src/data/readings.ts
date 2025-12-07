export interface ReadingItem {
    title: string
    url: string
    status: 'inbox' | 'reading' | 'done'
    tags?: string[]
    date: string // YYYY-MM-DD
    note?: string
}

export const readings: ReadingItem[] = [
    // Example Inbox item
    {
        title: 'The Architecture of a Modern AI Agent',
        url: 'https://example.com/ai-agent-arch',
        status: 'inbox',
        tags: ['AI', 'Architecture'],
        date: '2025-12-07'
    },
    {
        title: 'Running Claude Code in a loop',
        url: 'https://anandchowdhary.com/blog/2025/running-claude-code-in-a-loop',
        status: 'inbox',
        tags: ['Claude', 'Agent'],
        date: '2025-12-07'
    },
    {
        title: 'RFD 0576: Oxide Computer',
        url: 'https://rfd.shared.oxide.computer/rfd/0576',
        status: 'inbox',
        tags: ['Engineering', 'RFD'],
        date: '2025-12-07'
    },
    {
        title: 'The unexpected effectiveness of one-shot decompilation with Claude',
        url: 'https://blog.chrislewis.au/the-unexpected-effectiveness-of-one-shot-decompilation-with-claude/',
        status: 'inbox',
        tags: ['Claude', 'Reverse Engineering'],
        date: '2025-12-07'
    },
    // Example Reading item
    {
        title: 'Understanding React Server Components',
        url: 'https://react.dev/blog/2020/12/21/data-fetching-with-react-server-components',
        status: 'reading',
        tags: ['React', 'Frontend'],
        date: '2025-12-06',
        note: 'Key takeaway: moving data fetching to the server reduces bundle size.'
    },
    // Example Done item
    {
        title: 'Rust for JavaScript Developers',
        url: 'https://www.rust-lang.org/',
        status: 'done',
        tags: ['Rust', 'Learning'],
        date: '2025-11-20',
        note: 'Great introduction to ownership and borrowing.'
    }
]
