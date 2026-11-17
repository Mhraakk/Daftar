// شیوه‌نامه خودبسنده نمودارها: هم در برنامه (درج در <head>) و هم در PDF (extraCss) به کار می‌رود، پس به Tailwind
// وابسته نیست. رنگ‌ها فقط از متغیرهای پوسته (--chart-*، --ink*، --surface) می‌آیند؛ در چاپ رنگ‌های روشن سنجیده می‌نشیند.
// مشخصات نشانه‌ها مطابق راهنمای dataviz: ستون حداکثر ۲۴px با سر گرد ۴px و پایه صاف، خط ۲px، نقطه ۸px با حلقه ۲px،
// شبکه موی ۱px توپر، فاصله ۲px میان نشانه‌های چسبیده، متن هرگز به رنگ سری.

export const CHART_CSS = `
.dfc{margin:0;color:rgb(var(--ink));min-width:0}
.dfc-head{margin-bottom:.5rem}
.dfc-title{margin:0;font-weight:700;font-size:.9375rem;line-height:1.5rem;color:rgb(var(--ink))}
.dfc-cap{color:rgb(var(--ink-3));font-weight:600}
.dfc-sum{margin:.125rem 0 0;font-size:.8125rem;line-height:1.375rem;color:rgb(var(--ink-2))}
.dfc-legend{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin:.375rem 0 .625rem;padding:0;list-style:none;font-size:.75rem;color:rgb(var(--ink-2))}
.dfc-legend li{display:flex;align-items:center;gap:.375rem}
.dfc-key{display:inline-block;width:.75rem;height:.75rem;border-radius:3px;flex-shrink:0}
.dfc-key-line{width:1rem;height:2px;border-radius:2px}
.dfc-key-outline{background:transparent!important;border:2px solid}
.dfc-frame{position:relative;display:flex;align-items:stretch}
.dfc-yaxis{position:relative;width:2.75rem;flex-shrink:0}
.dfc-tick{position:absolute;inset-inline-start:0;inset-inline-end:.375rem;transform:translateY(50%);font-size:.6875rem;line-height:1rem;color:rgb(var(--chart-axis));font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.dfc-area{position:relative;flex:1;min-width:0}
.dfc-grid{position:absolute;inset-inline:0;height:0;border-top:1px solid rgb(var(--chart-grid))}
.dfc-grid.is-zero{border-top-color:rgb(var(--chart-axis)/.55)}
.dfc-cols{position:absolute;inset:0;display:flex;align-items:stretch}
.dfc-slot{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;justify-content:center;gap:2px;outline:none;border-radius:6px}
.dfc-slot:focus-visible{box-shadow:inset 0 0 0 2px rgb(var(--firuze)/.7)}
.dfc-col{position:relative;display:flex;align-items:flex-end;height:100%;width:min(24px,42%)}
.dfc-bar{width:100%;border-radius:4px 4px 0 0;min-height:1px;transition:filter .15s}
.dfc-slot:hover .dfc-bar,.dfc-slot:focus-visible .dfc-bar,.dfc-row:hover .dfc-hbar,.dfc-row:focus-visible .dfc-hbar,.dfc-cell:hover,.dfc-cell:focus-visible{filter:brightness(1.15) saturate(1.1)}
.dfc-val{position:absolute;inset-inline:-1.5rem;text-align:center;font-size:.6875rem;line-height:1rem;font-weight:700;color:rgb(var(--ink));white-space:nowrap;margin-bottom:2px}
.dfc-xlabels{display:flex;margin-top:.375rem}
.dfc-xlabel{flex:1;min-width:0;display:flex;justify-content:center;font-size:.6875rem;line-height:1rem;color:rgb(var(--chart-axis));white-space:nowrap;overflow:visible}
.dfc-xlabel.is-skip{visibility:hidden}
.dfc-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dfc-dot{position:absolute;width:8px;height:8px;border-radius:999px;transform:translate(50%,50%);box-shadow:0 0 0 2px rgb(var(--surface))}
.dfc-dot-label{position:absolute;transform:translateY(50%);padding-inline-start:.5rem;font-size:.6875rem;line-height:1rem;font-weight:700;color:rgb(var(--ink));white-space:nowrap}
.dfc-hit{position:absolute;inset-block:0;outline:none}
.dfc-hit::after{content:"";position:absolute;inset-block:0;inset-inline-start:50%;border-inline-start:1px solid rgb(var(--chart-axis)/.6);opacity:0}
.dfc-hit:hover::after,.dfc-hit:focus-visible::after{opacity:1}
.dfc-rows{display:flex;flex-direction:column;gap:.5rem}
.dfc-row{display:grid;grid-template-columns:minmax(5rem,30%) 1fr auto;align-items:center;gap:.625rem;outline:none;border-radius:6px;color:inherit;text-decoration:none}
.dfc-row:has(.dfc-track>.dfc-rval){grid-template-columns:minmax(5rem,30%) 1fr}
.dfc-row:focus-visible{box-shadow:0 0 0 2px rgb(var(--firuze)/.7)}
.dfc-rlabel{font-size:.8125rem;color:rgb(var(--ink-2));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dfc-track{position:relative;display:flex;align-items:center;gap:2px;height:16px;min-width:0}
.dfc-hbar{height:16px;max-height:24px;border-start-end-radius:4px;border-end-end-radius:4px;min-width:1px;transition:filter .15s}
.dfc-seg{height:16px;min-width:2px}
.dfc-seg:first-child{border-start-start-radius:4px;border-end-start-radius:4px}
.dfc-seg:last-child{border-start-end-radius:4px;border-end-end-radius:4px}
.dfc-rval{font-size:.8125rem;font-weight:700;color:rgb(var(--ink));font-variant-numeric:tabular-nums;white-space:nowrap;min-width:2.5rem;text-align:end}
.dfc-track>.dfc-rval{min-width:0;text-align:start;padding-inline-start:.375rem}
.dfc-sparkwrap{position:relative;display:block}
.dfc-fval{color:rgb(var(--ink));font-variant-numeric:tabular-nums}
.dfc-rval small{font-weight:500;color:rgb(var(--ink-3));margin-inline-start:.25rem}
.dfc-var{display:grid;grid-template-columns:1fr 1fr;align-items:center;height:16px}
.dfc-var-neg{display:flex;justify-content:flex-end;height:16px}
.dfc-var-pos{display:flex;justify-content:flex-start;height:16px;border-inline-start:1px solid rgb(var(--chart-axis)/.7)}
.dfc-var-neg>span{border-start-start-radius:4px;border-end-start-radius:4px}
.dfc-var-pos>span{border-start-end-radius:4px;border-end-end-radius:4px}
.dfc-heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,var(--cell));grid-auto-columns:var(--cell);gap:3px}
.dfc-heat-wrap{display:flex;gap:.375rem;align-items:flex-start;overflow-x:auto;padding-bottom:.25rem}
.dfc-heat-days{display:grid;grid-template-rows:repeat(7,var(--cell));gap:3px;font-size:.625rem;line-height:var(--cell);color:rgb(var(--chart-axis))}
.dfc-heat-months{display:grid;grid-auto-flow:column;grid-auto-columns:var(--cell);gap:3px;height:1rem;font-size:.625rem;color:rgb(var(--chart-axis));white-space:nowrap}
.dfc-cell{width:var(--cell);height:var(--cell);border-radius:3px;background:rgb(var(--surface-2));outline:none}
.dfc-cell.is-out{visibility:hidden}
.dfc-scale{display:flex;align-items:center;gap:3px;font-size:.6875rem;color:rgb(var(--ink-3));margin-top:.5rem}
.dfc-tl{position:relative}
.dfc-tl-row{display:grid;grid-template-columns:minmax(6rem,28%) 1fr;align-items:center;gap:.625rem;min-height:1.75rem}
.dfc-tl-track{position:relative;height:1.75rem}
.dfc-tl-bar{position:absolute;top:50%;height:12px;transform:translateY(-50%);border-radius:4px;min-width:6px;outline:none}
.dfc-tl-bar:focus-visible{box-shadow:0 0 0 2px rgb(var(--firuze)/.7)}
.dfc-tl-mark{position:absolute;top:50%;width:10px;height:10px;border-radius:999px;transform:translate(50%,-50%);box-shadow:0 0 0 2px rgb(var(--surface))}
.dfc-today{position:absolute;inset-block:0;border-inline-start:1px solid rgb(var(--mohr));z-index:1}
.dfc-today>span{position:absolute;top:-1.1rem;transform:translateX(50%);font-size:.625rem;color:rgb(var(--mohr));white-space:nowrap}
.dfc-funnel{display:flex;flex-direction:column;gap:.375rem}
.dfc-fstep{display:grid;grid-template-columns:minmax(6rem,30%) 1fr;align-items:center;gap:.625rem;outline:none}
.dfc-fbar-wrap{display:flex;justify-content:center}
.dfc-fbar{height:22px;border-radius:4px;min-width:2px}
.dfc-fconv{grid-column:2;text-align:center;font-size:.6875rem;color:rgb(var(--ink-3))}
.dfc-ring{position:relative;display:inline-grid;place-items:center}
.dfc-ring>span{position:absolute;font-weight:800;color:rgb(var(--ink))}
.dfc-spark{display:block;width:100%;height:100%;overflow:visible}
.dfc-table{margin-top:.75rem;font-size:.8125rem}
.dfc-table summary{cursor:pointer;color:rgb(var(--lapis));font-size:.75rem;width:max-content}
.dfc-table table{width:100%;border-collapse:collapse;margin-top:.5rem}
.dfc-table th,.dfc-table td{border-bottom:1px solid rgb(var(--line));padding:.375rem .5rem;text-align:start}
.dfc-table th{font-size:.75rem;color:rgb(var(--ink-2));font-weight:700}
.dfc-table td.is-num,.dfc-table th.is-num{text-align:end;font-variant-numeric:tabular-nums}
.dfc-tip{position:fixed;z-index:80;pointer-events:none;min-width:8rem;max-width:18rem;padding:.5rem .625rem;border-radius:10px;background:rgb(var(--surface));color:rgb(var(--ink));border:1px solid rgb(var(--line));box-shadow:0 16px 40px -16px rgb(var(--scrim)/.45);font-size:.75rem;line-height:1.25rem}
.dfc-tip b{display:block;margin-bottom:.125rem;font-size:.75rem;color:rgb(var(--ink-2));font-weight:600}
.dfc-tip div{display:flex;align-items:center;gap:.5rem}
.dfc-tip i{width:.75rem;height:2px;border-radius:2px;flex-shrink:0}
.dfc-tip strong{font-weight:800;font-variant-numeric:tabular-nums;color:rgb(var(--ink))}
.dfc-tip span{color:rgb(var(--ink-3))}
.dfc-stat{display:flex;flex-direction:column;gap:.25rem;min-width:0}
.dfc-stat-label{font-size:.8125rem;color:rgb(var(--ink-2))}
.dfc-stat-value{font-size:1.75rem;line-height:2.25rem;font-weight:800;color:rgb(var(--ink))}
.dfc-stat-delta{font-size:.75rem;font-weight:700}
.dfc-stat-delta span{color:rgb(var(--ink-3));font-weight:500}
.dfc-stat-delta.is-good{color:rgb(var(--sabz))}.dfc-stat-delta.is-bad{color:rgb(var(--mohr))}.dfc-stat-delta.is-flat{color:rgb(var(--ink-3))}
@media print{.dfc-table{display:none}.dfc-tip{display:none}}
@media (prefers-reduced-motion:reduce){.dfc-bar,.dfc-hbar{transition:none}}
`;
