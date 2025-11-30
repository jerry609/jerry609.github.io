import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'
import matter from 'gray-matter'

// 配置：在这里设置你的 API Key 和 Base URL
// 建议将 Key 放在环境变量中，不要直接写在代码里
const API_KEY = process.env.AI_API_KEY
const BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1'
const MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo'

if (!API_KEY) {
  console.error('❌ 请设置环境变量 AI_API_KEY')
  console.log('示例: $env:AI_API_KEY="sk-..." ; bun run scripts/ai-summary.ts')
  process.exit(1)
}

async function generateSummary(content: string): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的博客编辑。请为以下文章内容生成一段简短的摘要（Description），长度控制在 100 字以内，语言风格轻松自然。直接返回摘要内容，不要包含引号或其他前缀。'
          },
          {
            role: 'user',
            content: content.slice(0, 3000) // 限制长度以节省 token
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content.trim()
  } catch (error) {
    console.error('生成摘要失败:', error)
    return ''
  }
}

async function main() {
  const files = await glob('src/content/blog/**/*.{md,mdx}')
  
  console.log(`🔍 找到 ${files.length} 篇文章，开始检查摘要...`)

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8')
    const parsed = matter(content)
    
    // 检查 description 是否存在或为空
    if (!parsed.data.description || parsed.data.description.trim() === '' || parsed.data.description.includes('TODO')) {
      console.log(`📝 正在为 ${file} 生成摘要...`)
      
      // 去除 frontmatter，只保留正文
      const body = parsed.content
      const summary = await generateSummary(body)
      
      if (summary) {
        // 更新 frontmatter
        parsed.data.description = summary
        
        // 重新组合文件内容
        const newContent = matter.stringify(parsed.content, parsed.data)
        await fs.writeFile(file, newContent)
        console.log(`✅ 已更新: ${file}`)
      }
    }
  }
  console.log('🎉 处理完成！')
}

main()
