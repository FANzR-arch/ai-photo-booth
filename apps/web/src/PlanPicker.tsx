import { packageMinutes, priceText, type PhotoPackage } from '../../../packages/shared/photo-packages';

/** Before the first theme: how many photos this visit takes. Each card shows the count, the rough total time and, if set, the price. */
export function PlanPicker({ packages, onPick, onBack }: { packages: PhotoPackage[]; onPick: (item: PhotoPackage) => void; onBack: () => void }) {
    return <section className="theme-screen plan-screen" aria-label="选择拍照张数">
        <div className="theme-heading"><button className="secondary" onClick={onBack}>← 返回</button><h1>这次拍几张？</h1></div>
        <div className="plan-options">{packages.map(item => <button key={item.count} className="plan-option" onClick={() => onPick(item)}>
            <strong>{item.count}<small>张</small></strong>
            <span>约 {packageMinutes(item.count)} 分钟</span>
            {item.price !== undefined && <em>{priceText(item.price)}</em>}
        </button>)}</div>
        <p className="plan-note">每张都可以换一个主题 · 每张出图约 40 秒</p>
    </section>;
}
