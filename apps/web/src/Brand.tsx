/** Lucide Camera, ISC license. Source and license bundled under assets/. */
export function Brand({ href = '/', label = '咔嚓照相馆首页' }: { href?: string | null; label?: string } = {}) {
    const Tag = href === null ? 'div' : 'a';
    return <Tag className="brand" {...(href === null ? {} : { href, 'aria-label': label })}><svg className="brand-mark camera-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></svg><span>咔嚓！<small>SNAP CLUB · 照相馆</small></span></Tag>;
}
