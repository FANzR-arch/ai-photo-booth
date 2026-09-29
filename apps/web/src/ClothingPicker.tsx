import { clothingModes, type ClothingMode } from '../../../packages/shared/clothing';

export function ClothingPicker({ value, onChange, disabled }: { value: ClothingMode; onChange: (value: ClothingMode) => void; disabled: boolean }) {
    return <fieldset className="orientation-picker clothing-picker" disabled={disabled}>
        <legend>是否更换服装</legend>
        <div className="orientation-options">{clothingModes.map(item => <button type="button" key={item.id} className={value === item.id ? 'selected' : ''} aria-pressed={value === item.id} onClick={() => onChange(item.id)}>
            <span><strong>{item.name}</strong><small>{item.note}</small></span><i aria-hidden="true">{value === item.id ? '✓' : ''}</i>
        </button>)}</div>
        <p className="clothing-note">{value === 'theme' ? '按主题搭配服装和设计动作，优先保持每个人的脸部辨识度。' : '保留衣服款式与配色，动作和表情按主题设计，优先保持本人样貌。'}</p>
    </fieldset>;
}
