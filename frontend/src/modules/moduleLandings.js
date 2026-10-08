import { ClipboardPlus, Hand, Route } from 'lucide-react'
import { NAV_ITEMS, STORES_LANDING_TILES } from '../utils/constants'
import productionPlanningTile from '../assets/tiles/production_planning.webp'
import productionEntryTile from '../assets/tiles/production_entry.webp'
import customerEnquiryTile from '../assets/tiles/customer_enquiry.webp'
import customerOrdersTile from '../assets/tiles/customer_orders.webp'
import jobworkIssueTile from '../assets/tiles/jobwork_issue.webp'
import jobworkReceiptTile from '../assets/tiles/jobwork_receipt.webp'
import maintenanceChecklistTile from '../assets/tiles/maintenance_checklist.webp'
import maintenancePlanningTile from '../assets/tiles/maintenance_planning.webp'
import rmReceiptTile from '../assets/tiles/rm_receipt.webp'
import rmIssueTile from '../assets/tiles/rm_issue.webp'
import wipReceiptTile from '../assets/tiles/wip_receipt.webp'
import wipIssueTile from '../assets/tiles/wip_issue.webp'
import fgReceiptTile from '../assets/tiles/fg_receipt.webp'
import fgDespatchTile from '../assets/tiles/fg_despatch.webp'

// Pastel card + icon colour per module (matches the sidebar's module icon
// colours) for screens that have no deck picture.
const MODULE_TONES = {
  production: { bg: '#E0F2FE', icon: '#0284C7' },
  'customer-order': { bg: '#EDE9FE', icon: '#7C3AED' },
  'job-order': { bg: '#FFEDD5', icon: '#EA580C' },
  maintenance: { bg: '#FFE4E6', icon: '#E11D48' },
  stores: { bg: '#CCFBF1', icon: '#0D9488' },
}

// Deck picture (cropped to the artwork; bg sampled from it) or icon per
// tile key. Labels never come from here -- see constants.js.
const TILE_ART = {
  production: {
    'production-data-entry': { img: productionEntryTile, bg: '#FEF0D3' },
    'manual-operations': { icon: Hand },
    planning: { img: productionPlanningTile, bg: '#CFECFE' },
    'route-card': { icon: Route },
  },
  'customer-order': {
    enquiry: { img: customerEnquiryTile, bg: '#E4F1FF' },
    order: { img: customerOrdersTile, bg: '#EEFBE2' },
  },
  'job-order': {
    dispatch: { img: jobworkIssueTile, bg: '#FEF3E2' },
    receipt: { img: jobworkReceiptTile, bg: '#E6F4FD' },
  },
  maintenance: {
    checklist: { img: maintenanceChecklistTile, bg: '#FEF3E2' },
    plan: { img: maintenancePlanningTile, bg: '#E0F3FF' },
  },
  stores: {
    'rm-receipt': { img: rmReceiptTile, bg: '#EBF9EB' },
    'rm-issue': { img: rmIssueTile, bg: '#FFF1E1' },
    'wip-receipt': { img: wipReceiptTile, bg: '#E0F3FD' },
    'wip-issue': { img: wipIssueTile, bg: '#EEEAFE' },
    'fg-receipt': { img: fgReceiptTile, bg: '#FFE5E9' },
    'fg-despatch': { img: fgDespatchTile, bg: '#E2FAFD' },
    'rm-requisition': { icon: ClipboardPlus },
  },
}

function withArt(moduleKey, tile) {
  const art = TILE_ART[moduleKey]?.[tile.key] ?? {}
  const tone = MODULE_TONES[moduleKey]
  return art.img
    ? { ...tile, img: art.img, bg: art.bg }
    : { ...tile, icon: art.icon, bg: tone.bg, iconColor: tone.icon }
}

/** Landing tiles for a module: { key, label, subKey, mode?, img|icon, bg }.
 * Every sub-screen in NAV_ITEMS order; Stores uses STORES_LANDING_TILES. */
export function landingTiles(moduleKey) {
  const base =
    moduleKey === 'stores'
      ? STORES_LANDING_TILES
      : (NAV_ITEMS.find((n) => n.key === moduleKey)?.subItems ?? []).map((s) => ({ ...s, subKey: s.key }))
  return base.map((tile) => withArt(moduleKey, tile))
}
