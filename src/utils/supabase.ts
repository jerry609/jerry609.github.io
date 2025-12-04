import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Generate browser fingerprint for anonymous user identification
export function getBrowserFingerprint(): string {
    const cached = localStorage.getItem('user_fingerprint')
    if (cached) return cached

    const fingerprint = btoa(
        `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone
        }|${navigator.language}`
    )

    localStorage.setItem('user_fingerprint', fingerprint)
    return fingerprint
}

// Photo Likes
export async function likePhoto(photoId: string) {
    const fingerprint = getBrowserFingerprint()

    const { data, error } = await supabase
        .from('photo_likes')
        .insert({ photo_id: photoId, user_fingerprint: fingerprint })

    if (error?.code === '23505') {
        // Duplicate, user already liked
        return { alreadyLiked: true }
    }

    return { data, error }
}

export async function unlikePhoto(photoId: string) {
    const fingerprint = getBrowserFingerprint()

    const { error } = await supabase
        .from('photo_likes')
        .delete()
        .eq('photo_id', photoId)
        .eq('user_fingerprint', fingerprint)

    return { error }
}

export async function getPhotoLikes(photoId: string) {
    const { count, error } = await supabase
        .from('photo_likes')
        .select('*', { count: 'exact', head: true })
        .eq('photo_id', photoId)

    return { count: count ?? 0, error }
}

export async function hasUserLiked(photoId: string) {
    const fingerprint = getBrowserFingerprint()

    const { data, error } = await supabase
        .from('photo_likes')
        .select('id')
        .eq('photo_id', photoId)
        .eq('user_fingerprint', fingerprint)
        .single()

    return { liked: !!data, error }
}

// Photo Comments
export async function addComment(photoId: string, username: string, comment: string) {
    const { data, error } = await supabase
        .from('photo_comments')
        .insert({ photo_id: photoId, username, comment })
        .select()

    return { data, error }
}

export async function getComments(photoId: string) {
    const { data, error } = await supabase
        .from('photo_comments')
        .select('*')
        .eq('photo_id', photoId)
        .order('created_at', { ascending: false })

    return { data: data ?? [], error }
}

export async function getCommentCount(photoId: string) {
    const { count, error } = await supabase
        .from('photo_comments')
        .select('*', { count: 'exact', head: true })
        .eq('photo_id', photoId)

    return { count: count ?? 0, error }
}
