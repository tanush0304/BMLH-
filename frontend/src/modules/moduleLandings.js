import { Route } from 'lucide-react'
import { NAV_ITEMS, STORES_LANDING_TILES, canSeeSubItem } from '../utils/constants'
import productionPlanningTile from '../assets/tiles/production_planning.webp'
import productionEntryTile from '../assets/tiles/production_entry.webp'
// Manual Operations / Shift Verification: deck slide 20 (title banner cropped off).
import manualOperationsTile from '../assets/tiles/manual_operations.webp'
import shiftVerificationTile from '../assets/tiles/shift_verification.webp'
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
import qualityInspectionTile from '../assets/tiles/quality_inspection.webp'
import customerComplaintTile from '../assets/tiles/customer_complaint.webp'
import reportCustomerOrderTile from '../assets/tiles/report_customer_order_status.webp'
import reportJobOrderTile from '../assets/tiles/report_job_order_status.webp'
import reportProductionTile from '../assets/tiles/report_production_status.webp'
import reportDailyMachineTile from '../assets/tiles/report_daily_machine_status.webp'
import reportDowntimeTile from '../assets/tiles/report_machine_downtime.webp'
import reportQualityTile from '../assets/tiles/report_quality_status.webp'
import reportWipTile from '../assets/tiles/report_wip_status.webp'
import reportRawMaterialTile from '../assets/tiles/report_raw_material_status.webp'
import reportFinishedGoodsTile from '../assets/tiles/report_finished_goods_status.webp'

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
    'manual-operations': { img: manualOperationsTile, bg: '#E8F5EC' },
    planning: { img: productionPlanningTile, bg: '#CFECFE' },
    'route-card': { icon: Route },
    'shift-verification': { img: shiftVerificationTile, bg: '#E6F0FD' },
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
  quality: {
    inspection: { img: qualityInspectionTile, bg: '#DEFDDF' },
    complaint: { img: customerComplaintTile, bg: '#FEE9EA' },
  },
  stores: {
    'rm-receipt': { img: rmReceiptTile, bg: '#EBF9EB' },
    'rm-issue': { img: rmIssueTile, bg: '#FFF1E1' },
    'wip-receipt': { img: wipReceiptTile, bg: '#E0F3FD' },
    'wip-issue': { img: wipIssueTile, bg: '#EEEAFE' },
    'fg-receipt': { img: fgReceiptTile, bg: '#FFE5E9' },
    'fg-despatch': { img: fgDespatchTile, bg: '#E2FAFD' },
  },
  // Reports (deck slide 18): illustration cropped from each card, the card's
  // pastel bg, and its accent (title / pill colour).
  dashboard: {
    'customer-order-status': { img: reportCustomerOrderTile, bg: '#E3F2FD', accent: '#0D3B8E' },
    'job-order-status': { img: reportJobOrderTile, bg: '#E8FDEA', accent: '#1E7A34' },
    'production-status': { img: reportProductionTile, bg: '#FEF0E2', accent: '#B4410C' },
    'daily-machine': { img: reportDailyMachineTile, bg: '#F4EAFD', accent: '#5B2BB5' },
    downtime: { img: reportDowntimeTile, bg: '#FEEAEF', accent: '#C81E2E' },
    'quality-status': { img: reportQualityTile, bg: '#DEFDED', accent: '#167A3E' },
    'wip-status': { img: reportWipTile, bg: '#FDF6D9', accent: '#8A5300' },
    'rm-status': { img: reportRawMaterialTile, bg: '#DCEFFE', accent: '#1E3A8A' },
    'fg-inventory': { img: reportFinishedGoodsTile, bg: '#F3E8FD', accent: '#6D28D9' },
    // Not on the deck: reuses the Quality landing's Customer Complaint picture.
    'complaint-status': { img: customerComplaintTile, bg: '#FFF4E5', accent: '#B45309' },
  },
}

function withArt(moduleKey, tile) {
  const art = TILE_ART[moduleKey]?.[tile.key] ?? {}
  const tone = MODULE_TONES[moduleKey]
  return art.img
    ? { ...tile, img: art.img, bg: art.bg, accent: art.accent }
    : { ...tile, icon: art.icon, bg: tone.bg, iconColor: tone.icon }
}

/** Landing tiles for a module: { key, label, subKey, mode?, img|icon, bg }.
 * Every sub-screen in NAV_ITEMS order that `role` may open (sub-items with
 * `roles`, e.g. Shift Verification, are hidden from other roles; sub-items with
 * `landing: false` are sidebar-only); Stores uses
 * STORES_LANDING_TILES. */
export function landingTiles(moduleKey, role) {
  const base =
    moduleKey === 'stores'
      ? STORES_LANDING_TILES
      : (NAV_ITEMS.find((n) => n.key === moduleKey)?.subItems ?? [])
          .filter((s) => canSeeSubItem(s, role) && s.landing !== false)
          .map((s) => ({ ...s, subKey: s.key }))
  return base.map((tile) => withArt(moduleKey, tile))
}
