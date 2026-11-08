import * as THREE from 'three';

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const sphere = new THREE.Sphere();

/**
 * True when a ball of `radius` round `centre` lies wholly outside what the camera sees. The camera
 * looks steeply down, so a whole far site can be left out of the frame with one test instead of a
 * test per part (and its glows, which are always drawn, stop being drawn from across the world).
 */
export function outOfView(camera: THREE.Camera, centre: THREE.Vector3, radius: number): boolean {
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
  sphere.center.copy(centre);
  sphere.radius = radius;
  return !frustum.intersectsSphere(sphere);
}
