#ifdef VERT

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float pointSize;
uniform float time;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 texCoord;

attribute vec4 lineColor;
attribute vec4 fillColor;
attribute vec4 accentColor;
attribute float scale;

varying vec3 vNormal;
varying vec4 vColor;
varying vec2 vTexCoord;
varying vec4 vLineColor;
varying vec4 vFillColor;
varying vec4 vAccentColor;

#pragma glslify: import('./DisplacementStrong.glsl')
#pragma glslify: snoise3 = require(glsl-noise/simplex/3d)

void main() {
  vec3 pos = position;

  pos += calcStrongDisplacement(pos);

  //sway
  pos.xy += 0.05 * snoise3(vec3(pos.x + time/100.0, pos.y, pos.x)*5.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = pointSize * scale;
  vNormal = normal;
  vColor = color;
  vTexCoord = texCoord;
  vLineColor = lineColor;
  vFillColor = fillColor;
  vAccentColor = accentColor;
}

#endif

#ifdef FRAG

#define PI 3.14159265359

uniform sampler2D texture;
uniform float alpha;
uniform vec2 texSize;
uniform vec2 texOffset;

varying vec3 vNormal;
varying vec4 vColor;
varying vec2 vTexCoord;

varying vec4 vLineColor;
varying vec4 vFillColor;
varying vec4 vAccentColor;

//http://www.cg.info.hiroshima-cu.ac.jp/~miyazaki/knowledge/teche31.html
mat2 rotate2(float angle) {
  return mat2(
    cos( angle ), -sin( angle ),
    sin( angle ),  cos( angle )
  );
}


void main() {
  float rot = vNormal.x;
  rot += PI / 2.0;

  vec2 texCoord = gl_PointCoord;
  texCoord -= vec2(0.5, 0.5);
  texCoord = rotate2(rot) * texCoord;
  texCoord += vec2(0.5, 0.5);
  texCoord *= texSize;
  texCoord += texOffset * vTexCoord;

  vec4 c = texture2D(texture, texCoord);
  float a = c.a;

  vec4 c1 = vLineColor;
  vec4 c2 = vFillColor;
  vec4 c3 = vAccentColor;

  float total = (c.r + c.g + c.b)/3.0;

  gl_FragColor = c;
  gl_FragColor.rgb *= vColor.rgb;

  if (length(gl_PointCoord - 0.5) > 0.52) {
    gl_FragColor *= 0.0;
  }

  gl_FragColor *= alpha * total;
}

#endif
