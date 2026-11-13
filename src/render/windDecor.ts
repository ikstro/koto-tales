import * as THREE from 'three';

/** Only the dresser's loose bushes, flowers and tufts register here: never trees or props. */
export interface WindDecorCell { x:number; y:number; z:number; first:number; count:number; color:number }
interface Patch { mesh:THREE.InstancedMesh; cells:WindDecorCell[]; x0:number; z0:number; off:()=>void }
interface Broken { patch:Patch; cell:WindDecorCell; ys:Float32Array; until:number }
const MAX_BROKEN=48;
const RECOVER_AFTER=30;

/** Temporary changes to existing instance buffers. No chunk rebuild, world edits or extra draws. */
export class WindDecor {
  private patches=new Set<Patch>();
  private broken=new Map<WindDecorCell,Broken>();
  private point=new THREE.Vector3();

  register(mesh:THREE.InstancedMesh,cells:WindDecorCell[],x0:number,z0:number):void {
    if(!cells.length) return;
    const off=()=> {
      this.patches.delete(patch);
      for(const [cell,b] of this.broken) if(b.patch===patch) this.broken.delete(cell);
      mesh.removeEventListener('dispose',off);
    };
    const patch={mesh,cells,x0,z0,off};
    this.patches.add(patch);mesh.addEventListener('dispose',off);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  private restore(b:Broken):void {
    const attr=b.patch.mesh.instanceMatrix,array=attr.array;
    for(let i=0;i<b.cell.count;i++) array[(b.cell.first+i)*16+13]=b.ys[i];
    attr.addUpdateRange(b.cell.first*16,b.cell.count*16);attr.needsUpdate=true;
  }

  disturb=(at:THREE.Vector3|null,seconds:number,onBreak:(at:THREE.Vector3,color:number)=>void):void=> {
    for(const [cell,b] of this.broken) if(seconds>=b.until) { this.restore(b);this.broken.delete(cell); }
    if(!at || this.broken.size>=MAX_BROKEN) return;
    for(const patch of this.patches) {
      if(at.x<patch.x0-2.25 || at.x>patch.x0+18.25 || at.z<patch.z0-2.25 || at.z>patch.z0+18.25) continue;
      for(const cell of patch.cells) {
        if(this.broken.has(cell) || Math.abs(cell.y-at.y)>2.5 || Math.hypot(cell.x-at.x,cell.z-at.z)>2.25) continue;
        const attr=patch.mesh.instanceMatrix,array=attr.array,ys=new Float32Array(cell.count);
        for(let i=0;i<cell.count;i++) {
          const index=(cell.first+i)*16+13;ys[i]=array[index];array[index]=-1000;
        }
        attr.addUpdateRange(cell.first*16,cell.count*16);attr.needsUpdate=true;
        this.broken.set(cell,{patch,cell,ys,until:seconds+RECOVER_AFTER});
        onBreak(this.point.set(cell.x,cell.y+0.3,cell.z),cell.color);
        return; // At most one small plant cluster per contact tick.
      }
    }
  };

  dispose():void {
    for(const b of this.broken.values()) this.restore(b);
    this.broken.clear();
    for(const patch of [...this.patches]) patch.off();
  }
}
