import {NextResponse} from 'next/server';import {supabaseAdmin,supabaseServer} from '@/lib/supabase-server';import {downloadImage} from '@/lib/images';import {renderPoster} from '@/lib/poster';
export const maxDuration=60;
export async function POST(req:Request){try{const s=await supabaseServer();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const b=await req.json();const db=supabaseAdmin();const {data:p,error}=await db.from('posts').select('*').eq('id',b.id).single();if(error||!p)return NextResponse.json({error:'Post not found'},{status:404});let imageUrl=p.image_url;if(b.image_url)imageUrl=b.image_url;if(!imageUrl)return NextResponse.json({error:'Choose an image first'},{status:400});const img=await downloadImage(imageUrl);const png=await renderPoster({image:img,headline:b.headline,subheadline:b.subheadline,source:b.source,phrases:b.phrases||[],design:b.design,logo:b.design?.logo||'auto'});const path=`${user.id}/${p.id}.png`;const up=await db.storage.from('posters').upload(path,png,{contentType:'image/png',upsert:true});if(up.error)throw up.error;const {data:pub}=db.storage.from('posters').getPublicUrl(path);const token=crypto.randomUUID().replaceAll('-','');await db.from('posts').update({headline:b.headline,subheadline:b.subheadline,source_label:b.source,caption:p.caption,design:b.design,poster_path:path,poster_url:pub.publicUrl}).eq('id',p.id);await db.from('share_links').upsert({post_id:p.id,token},{onConflict:'post_id'});return NextResponse.json({poster_url:pub.publicUrl,share_url:`/share/${token}`})}catch (e: any) {
  console.error("POSTER_RENDER_ERROR:", e);
  
  return NextResponse.json(
    {
      error: e?.message || "Render failed",
      stack: e?.stack || String(e)
    },
    { status: 500 }
  );
}}
