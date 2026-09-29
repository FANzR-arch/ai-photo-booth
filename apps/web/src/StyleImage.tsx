/** Replace bundled vector studies with generated artwork; custom admin uploads stay intact. */
export function StyleImage({ src, alt }: { src: string; alt: string }) {
    if (/\/examples\/scene-(03|04|05|09c|10c)\.webp$/.test(src))
        return <span className="style-image unconfigured-art" role="img" aria-label={alt}>双人主题<br />待补充样片</span>;
    const quadrant = ({ '/examples/editorial-reference.png': 'tl', '/examples/anime-reference.png': 'tr', '/examples/film-reference.png': 'bl', '/examples/festival-reference.png': 'br' } as Record<string, string>)[src];
    if (src === '/examples/city-reference.png' || src === '/examples/brand-reference.png')
        return <span className="style-image unconfigured-art" role="img" aria-label="主题尚待配置">待配置<br />主题参考</span>;
    if (quadrant) return <span className={`style-image collection-${quadrant}`}><img src="/examples/style-collection.png" alt={alt} loading="lazy" /></span>;
    const panel = src === '/examples/cinema.svg' ? 'left' : src === '/examples/business.svg' ? 'right' : '';
    const image = panel ? '/examples/editorial-duo.png' : src === '/examples/cartoon.svg' ? '/examples/cartoon-editorial.png' : src;
    return <span className={`style-image ${panel ? `duo-${panel}` : ''}`}><img src={image} alt={alt} loading="lazy" /></span>;
}
