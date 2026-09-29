/** Shared print templates and typography. Ratios are relative to the original photo width. */
export const frames = [
 { id:'none', name:'无边框', note:'纯粹影像', color:'#faf8f2', ink:'#34372f', side:0, bottom:0, motif:'none' },
 { id:'paper', name:'留白', note:'细线相纸', color:'#fcfaf3', ink:'#555448', side:.05, bottom:.085, motif:'line' },
 { id:'instant', name:'拍立得', note:'经典宽底', color:'#faf7ee', ink:'#514b40', side:.055, bottom:.20, motif:'none' },
 { id:'ink', name:'黑胶片', note:'暖黑画幅', color:'#292c28', ink:'#e8dfcb', side:.06, bottom:.10, motif:'line' },
 { id:'sage', name:'鼠尾草', note:'植物标本', color:'#d8dfce', ink:'#46543d', side:.075, bottom:.12, motif:'botanical' },
 { id:'rose', name:'玫瑰纸', note:'柔粉双线', color:'#edddd6', ink:'#795447', side:.065, bottom:.12, motif:'double' },
 { id:'gallery', name:'美术馆', note:'象牙装裱', color:'#f1ebdc', ink:'#655846', side:.11, bottom:.15, motif:'double' },
 { id:'postcard', name:'远方来信', note:'复古邮笺', color:'#f8f0df', ink:'#655344', side:.08, bottom:.16, motif:'postcard' },
 { id:'film', name:'35mm', note:'胶片齿孔', color:'#30312b', ink:'#e0c894', side:.095, bottom:.095, motif:'film' },
 { id:'grid', name:'野餐日', note:'奶油格纹', color:'#f8f1dd', ink:'#606448', side:.085, bottom:.14, motif:'grid' },
 { id:'midnight', name:'蓝调时刻', note:'藏蓝金线', color:'#283b48', ink:'#e5d5ad', side:.075, bottom:.13, motif:'corners' },
 { id:'ticket', name:'纪念票根', note:'点线收藏', color:'#e9dfca', ink:'#655742', side:.085, bottom:.17, motif:'ticket' },
 { id:'terracotta', name:'落日陶土', note:'暖赭装裱', color:'#bd735b', ink:'#fff3de', side:.07, bottom:.13, motif:'corners' },
] as const;
export type FrameId = typeof frames[number]['id'];
export const isFrameId = (id: unknown): id is FrameId => frames.some(f => f.id === id);
export const getFrame = (id: FrameId = 'none') => frames.find(f => f.id === id) ?? frames[0];
export const fonts = [
 { id:'serif', name:'雅致宋体', family:'SimSun', sample:'时光有信' },
 { id:'sans', name:'简洁黑体', family:'Microsoft YaHei', sample:'时光有信' },
 { id:'hand', name:'手写楷体', family:'KaiTi', sample:'时光有信' },
] as const;
export interface Caption { text: string; font: typeof fonts[number]['id']; size:'small'|'medium'|'large'; align:'left'|'center'|'right'; color:'auto'|'clay'|'olive'; }
export const defaultCaption: Caption = {text:'',font:'serif',size:'medium',align:'center',color:'auto'};
export function isCaption(v: unknown): v is Caption {
 if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
 const c=v as Caption;
 return typeof c.text==='string' && c.text.length<=80 && c.text.split('\n').length<=4 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(c.text)
  && fonts.some(f=>f.id===c.font) && ['small','medium','large'].includes(c.size)
  && ['left','center','right'].includes(c.align) && ['auto','clay','olive'].includes(c.color);
}
const escapeXml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Deterministic wrapping keeps CJK, Latin and explicit newlines within the printable width. */
export function captionLines(text:string, maxWidth:number, fontSize:number) {
 const lines:string[]=[];
 for (const paragraph of text.replace(/\r/g,'').split('\n')) {
  let line='', width=0;
  for(const char of Array.from(paragraph)) {
   const advance=(/^[\x20-\x7e]$/.test(char) ? .7 : 1.1)*fontSize;
   if(width+advance>maxWidth && line){lines.push(line);line='';width=0;}
   line+=char;width+=advance;
  }
  lines.push(line);
 }
 return lines;
}
export function printLayout(width:number,height:number,id:FrameId,caption:Caption=defaultCaption) {
 const f=getFrame(id), side=Math.round(width*f.side);
 const fontSize=width*({small:.028,medium:.038,large:.05}[caption.size]);
 const lines=caption.text.trim() ? captionLines(caption.text,width*.86,fontSize) : [];
 const bottom=Math.max(Math.round(width*f.bottom),lines.length ? Math.ceil(lines.length*fontSize*1.55+width*.085) : 0);
 return {width:width+side*2,height:height+side+bottom,left:side,top:side,photoWidth:width,photoHeight:height,bottom,fontSize,lines};
}
/** SVG contains the paper, ornament and caption; the source photo is composited separately. */
export function printSvg(width:number,height:number,id:FrameId,caption:Caption=defaultCaption) {
 const f=getFrame(id),g=printLayout(width,height,id,caption),u=width/100;
 const stroke=f.ink, x=g.left,y=g.top,w=width,h=height;
 let details='';
 const rect=(inset:number,dash='')=>`<rect x="${inset}" y="${inset}" width="${g.width-inset*2}" height="${g.height-inset*2}" fill="none" stroke="${stroke}" stroke-opacity=".45" stroke-width="${u*.16}" ${dash}/>`;
 if(f.motif==='line') details=rect(u*1.5);
 if(f.motif==='double') details=rect(u*1.5)+rect(u*2.2);
 if(f.motif==='corners'){
  const inset=u*1.7,len=u*7;
  details=[ [inset,inset,1,1],[g.width-inset,inset,-1,1],[inset,g.height-inset,1,-1],[g.width-inset,g.height-inset,-1,-1] ].map(([a,b,dx,dy])=>`<path d="M ${a+dx*len} ${b} H ${a} V ${b+dy*len}" fill="none" stroke="${stroke}" stroke-width="${u*.24}"/>`).join('');
 }
 if(f.motif==='postcard'){
  for(let a=0;a<g.width;a+=u*10) details+=`<path d="M${a} 0 l${u*3} ${u*2.2} M${a} ${g.height-u*2.2} l${u*3} ${u*2.2}" stroke="${Math.round(a/u/10)%2 ? '#879c9d':'#b67663'}" stroke-width="${u*2}"/>`;
  details+=rect(u*3.2);
 }
 if(f.motif==='film') for(let a=u*3;a<g.height-u*3;a+=u*8) for(const b of [u*2,g.width-u*5]) details+=`<rect x="${b}" y="${a}" width="${u*3}" height="${u*4}" rx="${u*.6}" fill="#dbd3bf"/>`;
 if(f.motif==='grid') details=`<defs><pattern id="gingham" width="${u*4}" height="${u*4}" patternUnits="userSpaceOnUse"><path d="M0 0H${u*4} M0 0V${u*4}" stroke="#a9b298" stroke-opacity=".36" stroke-width="${u*1.8}"/></pattern></defs><rect width="100%" height="100%" fill="url(#gingham)"/>`;
 if(f.motif==='ticket') details=rect(u*2,`stroke-dasharray="${u*.5} ${u*.9}"`);
 if(f.motif==='botanical'){
  for(const sign of [1,-1]) {
   const a=sign===1?u*2.2:g.width-u*2.2;
   details+=`<path d="M${a} ${g.height-u*3} q${sign*u*2} ${-u*7} 0 ${-u*17}" fill="none" stroke="#819176" stroke-width="${u*.25}"/>`;
   for(let j=0;j<4;j++) details+=`<ellipse cx="${a+sign*u*(j%2?1.3:-.5)}" cy="${g.height-u*(5+j*3.6)}" rx="${u*.65}" ry="${u*1.7}" fill="#95a486" transform="rotate(${sign*30} ${a+sign*u*(j%2?1.3:-.5)} ${g.height-u*(5+j*3.6)})"/>`;
  }
 }
 const dark=['ink','film','midnight','terracotta'].includes(id);
 const color=caption.color==='auto'?stroke:caption.color==='clay'?(dark?'#f2c5ad':'#9a5745'):(dark?'#d5e0be':'#536647');
 const textX=caption.align==='left'?x+width*.07:caption.align==='right'?x+width*.93:g.width/2;
 const textY=y+h+(g.bottom-g.lines.length*g.fontSize*1.55)/2+g.fontSize*1.1;
 // Clear the caption band on patterned templates so small text remains legible.
 if(g.lines.length && f.motif==='grid') details+=`<rect x="${x}" y="${y+h+u*1.5}" width="${w}" height="${g.bottom-u*3}" fill="${f.color}"/>`;
 const family=fonts.find(font=>font.id===caption.font)!.family;
 const text=g.lines.map((line,i)=>`<text x="${textX}" y="${textY+i*g.fontSize*1.55}" text-anchor="${caption.align==='left'?'start':caption.align==='right'?'end':'middle'}" font-family="${family}" font-size="${g.fontSize}" fill="${color}">${escapeXml(line)}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}"><rect width="100%" height="100%" fill="${f.color}"/>${details}${text}</svg>`;
}
