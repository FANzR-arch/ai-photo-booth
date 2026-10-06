/** Render independent covers directly; the existing anime sheet keeps its quadrant crop. */
export function StyleImage({ src, alt }: { src: string; alt: string }) {
    if (src === '/examples/anime-reference.png')
        return <span className="style-image collection-tr"><img src="/examples/style-collection.png" alt={alt} loading="lazy" /></span>;
    return <span className="style-image"><img src={src} alt={alt} loading="lazy" /></span>;
}
