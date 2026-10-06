import React from 'react';
import { frames, fonts, printSvg, defaultCaption, type FrameId, type Caption } from '../../../packages/shared/frames';
export function FramePicker({value,onChange,recommended,caption=defaultCaption,onCaptionChange,saving,error}: {
 recommended?:FrameId;value:FrameId;onChange:(id:FrameId)=>void;caption?:Caption;onCaptionChange?:(caption:Caption)=>void;saving:boolean;error:string;
}) {
 const update=(patch:Partial<Caption>)=>onCaptionChange?.({...caption,...patch});
 return <section className="frame-picker" aria-label="照片装饰">
  <div className="frame-picker-heading"><h2>相纸</h2></div>
  <div className="frame-options" role="group" aria-label="边框样式">{frames.map(f=><button type="button" key={f.id} aria-label={f.name} aria-pressed={value===f.id} onClick={()=>onChange(f.id)}>
   <span className="frame-swatch" aria-hidden="true"><img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(printSvg(100,120,f.id).replace('</svg>',`<rect x="${Math.round(100*f.side)}" y="${Math.round(100*f.side)}" width="100" height="120" fill="#c4c4b3"/><path d="M${100*f.side} ${120+100*f.side} L${35+100*f.side} ${55+100*f.side} L${60+100*f.side} ${92+100*f.side} L${80+100*f.side} ${72+100*f.side} L${100+100*f.side} ${120+100*f.side}" fill="#939d85"/><circle cx="${72+100*f.side}" cy="${30+100*f.side}" r="12" fill="#e9dfc3"/></svg>`))} alt=""/></span>
   <span className="frame-name">{f.name}</span>{f.id===recommended && <small>推荐</small>}<span className="frame-check" aria-hidden="true">{value===f.id?'✓':''}</span>
  </button>)}</div>
  <div className="caption-editor">
   <div className="caption-heading"><span>留念文字（选填）</span><span>{caption.text.length}/80</span></div>
   <div className="caption-presets" role="group" aria-label="常用留念文字">{captionPresets().map(text=><button type="button" key={text||'none'} aria-pressed={caption.text===text} onClick={()=>update({text})}>{text||'不加文字'}</button>)}</div>
   <details className="caption-custom"><summary>自己输入文字</summary>
   <textarea id="photo-caption" aria-label="留念文字" maxLength={80} rows={2} placeholder="写点什么…" value={caption.text} onChange={e=>update({text:e.target.value.split('\n').slice(0,4).join('\n')})}/>
   </details>
   <details className="caption-more"><summary>字体与排版</summary><div className="caption-controls">
    <label>字体<select aria-label="文字字体" value={caption.font} onChange={e=>update({font:e.target.value as Caption['font']})}>{fonts.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <label>字号<select aria-label="文字字号" value={caption.size} onChange={e=>update({size:e.target.value as Caption['size']})}><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label>
    <label>颜色<select aria-label="文字颜色" value={caption.color} onChange={e=>update({color:e.target.value as Caption['color']})}><option value="auto">随边框</option><option value="clay">陶土</option><option value="olive">橄榄</option></select></label>
   </div>
   <div className="caption-bottom"><div className="caption-alignment" role="group" aria-label="文字对齐">{(['left','center','right'] as const).map((align,i)=><button type="button" key={align} aria-label={['左对齐','居中对齐','右对齐'][i]} aria-pressed={caption.align===align} onClick={()=>update({align})}><svg viewBox="0 0 20 20" aria-hidden="true"><path d={'M3 5h14 M'+(align==='left'?3:align==='center'?6:9)+' 10h8 M3 15h14'}/></svg></button>)}</div></div>
  </details></div>
  {(error || saving) && <p className="frame-status" role="status">{error || '正在保存…'}</p>}
  {error&&<button className="text-button" onClick={()=>onChange(value)}>重试保存边框</button>}
 </section>;
}

/** Tap-to-fill phrases: the kiosk has no keyboard, so free text stays behind "自己输入文字". */
function captionPresets() {
 const d=new Date();
 return ['', `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`, '今天也很好看', '生日快乐', '我们的合照', '咔嚓照相馆 · 留念'];
}
