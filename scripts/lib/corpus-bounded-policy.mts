/** Conservative, physical-page-preserving DPI plan for offline native PDF retries. */
export const MAX_RENDER_SIDE=4400;
export const MAX_RENDER_PIXELS=20_000_000;
export const MAX_DPI=300;
export const MIN_REVIEWABLE_DPI=100;
export const MAX_SELECTED_SIZE_RATIO=1.5;
const hashPattern=/^[a-f0-9]{64}$/;

export type SourceEntry={path:string;sha256:string;pages:number};
export type PhysicalPage={pdf:string;pdf_sha256:string;physical_page_number:number;mediabox_width_points:number;mediabox_height_points:number};
export type BoundedPlan={status:'eligible'|'deferred_missing_dimensions'|'deferred_mixed_page_sizes'|'deferred_resolution_too_low'|'deferred_no_musical_pages';
 selectedPhysicalPages:number[];excludedPhysicalPages:number[];excludedDecisions:Array<{page:number;originalImageSHA256:string;reviewer:string;reason:string}>;
 dpi:number|null;expectedImages:Array<{page:number;width:number;height:number,pixels:number}>;sizeRatio:number|null;reason:string};

export function verifiedExclusions(entry:SourceEntry,reviewPages:any[]):BoundedPlan['excludedDecisions']{
 if(entry.path==='Document.pdf')return [];
 const seen=new Set<number>();const decisions:BoundedPlan['excludedDecisions']=[];
 for(const page of reviewPages){
  const verified=page.api_verified_classification;
  if(page.pdf!==entry.path||page.pdf_sha256!==entry.sha256||page.source_sha256!==entry.sha256
   ||page.api_verified_decision_status!=='verified'||page.api_conflict_code
   ||verified?.method!=='verified_manual_v1'||verified?.decision!=='nonmusical'||verified?.sourceSHA256!==entry.sha256
   ||verified?.originalImageSHA256!==page.image_sha256||!hashPattern.test(verified.originalImageSHA256)
   ||page.image_render_max_dimension_px!==4400||!Number.isInteger(page.physical_page_number)||page.physical_page_number<1||page.physical_page_number>entry.pages
   ||typeof verified.reviewer!=='string'||!verified.reviewer.trim()||typeof verified.reason!=='string'||!verified.reason.trim()
   ||seen.has(page.physical_page_number))continue;
  seen.add(page.physical_page_number);
  decisions.push({page:page.physical_page_number,originalImageSHA256:verified.originalImageSHA256,reviewer:verified.reviewer,reason:verified.reason});
 }
 return decisions.sort((a,b)=>a.page-b.page);
}

export function computeBoundedPlan(entry:SourceEntry,physicalPages:PhysicalPage[],reviewPages:any[]):BoundedPlan{
 const decisions=verifiedExclusions(entry,reviewPages),excludedPhysicalPages=decisions.map(item=>item.page),excludedSet=new Set(excludedPhysicalPages);
 const selectedPhysicalPages=Array.from({length:entry.pages},(_,index)=>index+1).filter(page=>!excludedSet.has(page));
 const base={selectedPhysicalPages,excludedPhysicalPages,excludedDecisions:decisions,dpi:null,expectedImages:[],sizeRatio:null};
 if(!selectedPhysicalPages.length)return {...base,status:'deferred_no_musical_pages',reason:'All physical pages have verified nonmusical exclusions; no OMR candidate remains.'};
 const indexed=new Map(physicalPages.filter(item=>item.pdf===entry.path&&item.pdf_sha256===entry.sha256).map(item=>[item.physical_page_number,item]));
 const dimensions=selectedPhysicalPages.map(page=>indexed.get(page));
 if(dimensions.some(item=>!item||!Number.isFinite(item.mediabox_width_points)||!Number.isFinite(item.mediabox_height_points)
  ||item.mediabox_width_points<=0||item.mediabox_height_points<=0))return {...base,status:'deferred_missing_dimensions',reason:'Physical MediaBox dimensions are missing or invalid.'};
 const sizes=dimensions.map(item=>({long:Math.max(item!.mediabox_width_points,item!.mediabox_height_points),area:item!.mediabox_width_points*item!.mediabox_height_points}));
 const minSide=Math.min(...sizes.map(item=>item.long)),maxSide=Math.max(...sizes.map(item=>item.long));
 const sizeRatio=maxSide/minSide;
 if(sizeRatio>MAX_SELECTED_SIZE_RATIO)return {...base,sizeRatio,status:'deferred_mixed_page_sizes',reason:'Selected musical pages have mixed physical sizes; one global PDF DPI could degrade normal pages.'};
 const maxArea=Math.max(...sizes.map(item=>item.area));
 const dpi=Math.floor(Math.min(MAX_DPI,MAX_RENDER_SIDE*72/maxSide,72*Math.sqrt(MAX_RENDER_PIXELS/maxArea)));
 if(dpi<MIN_REVIEWABLE_DPI)return {...base,sizeRatio,status:'deferred_resolution_too_low',reason:'Resolution required by renderer bounds is below the conservative review floor.'};
 const expectedImages=selectedPhysicalPages.map(page=>{const item=indexed.get(page)!;
  const width=Math.floor(item.mediabox_width_points*dpi/72),height=Math.floor(item.mediabox_height_points*dpi/72);
  return {page,width,height,pixels:width*height};});
 if(expectedImages.some(item=>Math.max(item.width,item.height)>MAX_RENDER_SIDE||item.pixels>MAX_RENDER_PIXELS))
  return {...base,sizeRatio,status:'deferred_resolution_too_low',reason:'Predicted raster exceeds renderer bounds.'};
 return {...base,dpi,sizeRatio,expectedImages,status:'eligible',reason:'Uniform selected physical dimensions fit within bounded native PDF rendering.'};
}
