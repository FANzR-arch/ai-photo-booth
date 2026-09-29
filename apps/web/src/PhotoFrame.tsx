import React, { useState } from 'react';
import { printSvg, printLayout, defaultCaption, type FrameId, type Caption } from '../../../packages/shared/frames';
import type { PhotoOrientation } from '../../../packages/shared/photo-orientation';
import { orientationRatio } from '../../../packages/shared/photo-orientation';
export function PhotoFrame({ src, alt, frame, caption=defaultCaption, orientation, crop=false }: {src:string;alt:string;frame:FrameId;caption?:Caption;orientation?:PhotoOrientation;crop?:boolean}) {
 const [dimensions,setDimensions]=useState({width:600,height:800});
 const ratio=orientation ? orientationRatio(orientation).split(':').map(Number) : undefined;
 const displayDimensions=ratio ? {width:ratio[0]*1200/Math.max(...ratio),height:ratio[1]*1200/Math.max(...ratio)} : dimensions;
 const g=printLayout(displayDimensions.width,displayDimensions.height,frame,caption);
 return <div className={`photo-frame ${crop?'is-cropped':''}`} data-frame={frame} data-orientation={orientation} style={{aspectRatio:g.width+'/'+g.height}}>
  <img className="frame-art" src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(printSvg(displayDimensions.width,displayDimensions.height,frame,caption))} alt="" aria-hidden="true"/>
  <img className="frame-photo" src={src} alt={alt} style={{left:g.left/g.width*100+'%',top:g.top/g.height*100+'%',width:displayDimensions.width/g.width*100+'%',height:displayDimensions.height/g.height*100+'%'}} onLoad={e=>{const img=e.currentTarget;if(img.naturalWidth && img.naturalHeight)setDimensions({width:img.naturalWidth,height:img.naturalHeight});}}/>
 </div>;
}
export { FramePicker } from './FramePicker';
