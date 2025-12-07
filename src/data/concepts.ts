export interface Concept {
    term: string
    definition: string
    details?: string
    tags: string[]
    date: string
}

export const concepts: Concept[] = [
    {
        term: 'Agentic Patterns',
        definition: 'Design patterns for building autonomous AI agents.',
        details: 'Includes patterns like ReAct, Chain of Thought, Reflection, and Tool Use that enable LLMs to act as agents.',
        tags: ['AI', 'Agent', 'Architecture'],
        date: '2025-12-07'
    },
    {
        term: 'Digital Garden',
        definition: 'A personal knowledge management philosophy treating notes as living things to be cultivated.',
        details: 'Unlike a blog (chronological), a digital garden is topographical, evolving over time through tending and pruning.',
        tags: ['PKM', 'Philosophy', 'Web'],
        date: '2025-12-07'
    },
    {
        term: 'Masonry Layout',
        definition: 'A grid layout based on columns, reducing gaps by placing elements in optimal vertical spaces.',
        details: 'Often used by Pinterest. Essential for displaying content of varying heights efficiently.',
        tags: ['UI', 'Design', 'CSS'],
        date: '2025-12-07'
    },
    {
        term: 'Monorepo',
        definition: '一种软件开发策略，指在一个版本控制仓库中，包含多个独立项目或库的代码。',
        details: '与传统的 Polyrepo（多代码库）模式不同，Monorepo 旨在集中管理所有代码，以促进代码共享和统一开发流程。',
        tags: ['DevOps', 'Architecture', 'Git'],
        date: '2025-12-07'
    },
    {
        term: 'Progressive Disclosure',
        definition: '让智能体能够灵活、可扩展地利用领域专长且不占用过多上下文窗口的核心设计原则。',
        details: '模仿人类查阅手册的方式（目录 -> 章节 -> 附录），允许智能体仅在需要时加载信息。源自 Anthropic Agent Skills 框架。',
        tags: ['Agent', 'Architecture', 'Pattern'],
        date: '2025-12-07'
    },
    {
        term: 'Context Engineering',
        definition: '用下一步所需的恰当信息填充上下文窗口的艺术与科学。',
        details: '与提示工程不同，它侧重通过系统架构（卸载、缩减、检索、隔离、缓存）来解决上下文腐烂问题，优化信息流转。',
        tags: ['Agent', 'Engineering', 'Context'],
        date: '2025-12-07'
    },
    {
        term: 'Context Rot',
        definition: '随着上下文长度增加，模型性能显著下降的现象。',
        details: '包括上下文干扰（忽略指令）、上下文混淆（工具选择能力下降）和上下文冲突（信息矛盾）。',
        tags: ['LLM', 'Problem', 'Performance'],
        date: '2025-12-07'
    },
    {
        term: 'Agent Skills',
        definition: 'Anthropic 提出的一种通过分层管理信息将通用智能体转化为专用智能体的架构方法。',
        details: '强调“代码即文档”，通过元数据、核心指令、深度上下文的三层渐进披露，扩展智能体能力边界。',
        tags: ['Anthropic', 'Agent', 'Framework'],
        date: '2025-12-07'
    },
    {
        term: 'Context Confusion',
        definition: '当上下文中包含过多工具定义（>30个）时，模型选择工具的能力显著下降的现象。',
        details: 'Drew Breunig 观察到的问题。解决方案是通过渐进式披露"隐藏"非必要的工具细节。',
        tags: ['LLM', 'Problem', 'Tools'],
        date: '2025-12-07'
    },
    {
        term: 'Context Distraction',
        definition: '当上下文过长（>100k tokens）时，模型忽略指令或重复之前动作的现象。',
        details: '上下文腐烂的子类型之一。解决方案是将详细指令"卸载"到文件系统中。',
        tags: ['LLM', 'Problem', 'Attention'],
        date: '2025-12-07'
    },
    {
        term: 'Hierarchical Action Space',
        definition: 'Manus 提出的分层工具设计模式，避免将所有工具都放入上下文。',
        details: 'Level 1: 原子函数直接暴露；Level 2: CLI 沙盒工具按需调用；Level 3: 脚本与 API 执行复杂任务。',
        tags: ['Agent', 'Manus', 'Architecture'],
        date: '2025-12-07'
    },
    {
        term: 'Prompt Engineering',
        definition: '给予 LLM 简短任务描述以引导模型生成回答的技术。',
        details: '伴随 ChatGPT 兴起（2022）。侧重指令优化，主要用于聊天机器人场景。与 Context Engineering 形成对比。',
        tags: ['LLM', 'Technique', 'Basic'],
        date: '2025-12-07'
    },
    {
        term: 'Code as Documentation',
        definition: '代码既是可执行的工具，也是可阅读的文档。',
        details: 'Anthropic Agent Skills 的高级形式。智能体可以阅读代码理解逻辑，也可直接运行代码执行任务，节省 Token 并提高可靠性。',
        tags: ['Agent', 'Pattern', 'Philosophy'],
        date: '2025-12-07'
    },
    {
        term: 'Context Poisoning',
        definition: '当幻觉或错误信息进入上下文后被反复引用，导致智能体陷入追求无法实现目标的困境。',
        details: 'DeepMind 的 Gemini 实验中，智能体幻觉出游戏中不存在的道具，反复尝试使用导致任务失败。',
        tags: ['LLM', 'Problem', 'Hallucination'],
        date: '2025-12-07'
    },
    {
        term: 'Context Clash',
        definition: '多轮交互中逐步累积的信息相互矛盾时，严重削弱模型推理能力的现象。',
        details: '微软研究发现，分步提供信息比一次性提供导致性能下降 39%，因为早期错误假设会固化在上下文中。',
        tags: ['LLM', 'Problem', 'Multi-turn'],
        date: '2025-12-07'
    },
    {
        term: 'Context Offloading',
        definition: '将信息存储在 LLM 上下文之外，通过工具按需读取的策略。',
        details: '如将网页搜索的大量原始文本卸载到文件中，只在上下文保留路径引用。Anthropic 的 "think" 工具也体现此思想。',
        tags: ['Strategy', 'Context', 'Architecture'],
        date: '2025-12-07'
    },
    {
        term: 'Context Quarantine',
        definition: '将上下文隔离在专用线程中，每个线程由独立的 LLM 单独使用。',
        details: 'Anthropic 多智能体研究系统的做法：子智能体在独立上下文中并行探索，性能优于单智能体 90.2%。',
        tags: ['Strategy', 'Multi-Agent', 'Architecture'],
        date: '2025-12-07'
    },
    {
        term: 'Context Pruning',
        definition: '主动移除上下文中无关信息的策略，与压缩不同，它是"丢弃"而非"浓缩"。',
        details: 'Manus 区分压缩（可逆，如用路径替换内容）与摘要（不可逆），更倾向于可逆压缩以避免信息丢失。',
        tags: ['Strategy', 'Context', 'Optimization'],
        date: '2025-12-07'
    },
    {
        term: 'Tool Loadout',
        definition: '根据当前任务动态选择相关工具添加到上下文，而非提供所有可用工具。',
        details: '当工具数量超过 30 个时模型选择准确性急剧下降。动态选择可将小型模型性能提升 44%。',
        tags: ['Strategy', 'Tools', 'RAG'],
        date: '2025-12-07'
    },
    {
        term: 'Context Retrieval',
        definition: '选择性地将相关信息添加到上下文以帮助 LLM 生成更好响应的策略。',
        details: 'RAG 的延伸。Claude Code 和 Cursor 等编码智能体大量使用 ls、glob、grep 等工具实现精确检索。',
        tags: ['Strategy', 'RAG', 'Search'],
        date: '2025-12-07'
    },
    {
        term: 'Context Over-Engineering',
        definition: '上下文工程的反模式：添加过多不必要的复杂层次反而成为累赘。',
        details: 'Manus 团队最大的技术飞跃来自"移除不必要的技巧并更多地信任模型"。少即是多。',
        tags: ['Anti-Pattern', 'Philosophy', 'Simplicity'],
        date: '2025-12-07'
    },
    {
        term: 'KV Cache',
        definition: 'Transformer 推理中存储已计算的 Key 和 Value 向量矩阵，避免对相同前缀重复计算。',
        details: '注意力机制需要回顾所有历史 Token。KV Cache 将长 Prompt 的中间状态存储在显存中，新请求只需计算新增部分。',
        tags: ['LLM', 'Inference', 'Optimization'],
        date: '2025-12-07'
    },
    {
        term: 'Cache Hit',
        definition: 'LLM API 识别出请求的静态部分之前已处理过，直接复用 KV Cache 而非重新计算。',
        details: '带来速度提升（TTFT 缩短）和成本降低（缓存命中的 Token 价格通常是未命中的 1/10）。',
        tags: ['LLM', 'API', 'Cost'],
        date: '2025-12-07'
    },
    {
        term: 'Radix Attention',
        definition: '使用基数树（Radix Tree）管理 Token 序列，实现高效的前缀匹配和 KV Cache 复用。',
        details: '树的节点代表 Token 序列。请求的 Prompt 前缀匹配到节点后，该节点之前的 KV Cache 可直接复用。',
        tags: ['LLM', 'Algorithm', 'Inference'],
        date: '2025-12-07'
    },
    {
        term: 'PagedAttention',
        definition: '类似操作系统虚拟内存的 KV Cache 管理技术，将缓存分块存储在非连续显存中。',
        details: '通过 Page Table 将逻辑 Token 序列映射到物理显存块。vLLM 等推理引擎的核心技术。',
        tags: ['LLM', 'Inference', 'vLLM'],
        date: '2025-12-07'
    },
    {
        term: 'TTFT',
        definition: 'Time To First Token，首字生成时间，衡量 LLM 响应延迟的关键指标。',
        details: 'KV Cache 命中可大幅缩短 TTFT，因为跳过了处理长文档的时间。',
        tags: ['LLM', 'Metric', 'Performance'],
        date: '2025-12-07'
    }
]
