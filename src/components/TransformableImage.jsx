// src/components/TransformableImage.jsx
import React, { useEffect, useRef } from "react";
import { Image as KonvaImage, Transformer } from "react-konva";

export default function TransformableImage({
  image,
  value,
  onChange,
  isSelected,
  onSelect,
  minSize = 40,
  keepRatio = true,
  name = "packshot",
}) {
  const shapeRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  const v = value || {};
  const x = v.x ?? 120;
  const y = v.y ?? 240;
  const rotation = v.rotation ?? 0;
  const scaleX = v.scaleX ?? 1;
  const scaleY = v.scaleY ?? 1;

  return (
    <>
      <KonvaImage
        name={name}
        ref={shapeRef}
        image={image}
        x={x}
        y={y}
        rotation={rotation}
        scaleX={scaleX}
        scaleY={scaleY}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange?.({
            ...v,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;

          const nextScaleX = node.scaleX();
          const nextScaleY = node.scaleY();

          // Prevent shrinking to zero
          const width = node.width() * nextScaleX;
          const height = node.height() * nextScaleY;

          const safeScaleX = width < minSize ? minSize / Math.max(1, node.width()) : nextScaleX;
          const safeScaleY = height < minSize ? minSize / Math.max(1, node.height()) : nextScaleY;

          onChange?.({
            ...v,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: safeScaleX,
            scaleY: keepRatio ? safeScaleX : safeScaleY,
          });
        }}
      />

      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={keepRatio}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            // disallow too small
            if (newBox.width < minSize || newBox.height < minSize) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
