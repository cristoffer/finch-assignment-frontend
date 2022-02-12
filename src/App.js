import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { Earcut } from "three/src/extras/Earcut";
import { Canvas } from "react-three-fiber";
import CameraControls from "./CameraControls";
import NumericInput from "./components/numericInput";

THREE.Object3D.DefaultUp.set(0, 0, 1);

async function loadData(dimension) {
  let params = [];

  if (dimension) {
    const keys = Object.keys(dimension);
    let largest = 0;

    keys.forEach((k) => {
      if (parseInt(k) > largest) {
        largest = parseInt(k);
      }
    })

    params = Array.apply(null, Array(largest + 1)).map(function () {})

    Object.keys(dimension).forEach((key) => {
      params[key] = dimension[key]
    })
  }

  return new Promise(resolve => {
    fetch(
      `https://cchvf3mkzi.execute-api.eu-west-1.amazonaws.com/dev/build`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: JSON.stringify(params)
      },
    )
    .then(response => response.body)
    .then(stream => {
      const reader = stream.getReader();

      return new ReadableStream({
        start(controller) {
          function push() {
            reader.read().then( ({done, value}) => {
              if (done) {
                controller.close();
                return;
              }
              controller.enqueue(value);
              push();
            })
          }
          push();
        }
      });
    })
    .then(stream => {
      return new Response(stream, { headers: { "Content-Type": "text/html" } }).text();
    })
    .then(result => {
      resolve(JSON.parse(result))
    });
  })
}

let font;
async function loadFont() {
  if (!font) {
    return new Promise(resolve => {
      new THREE.FontLoader().load('/OpenSans_Regular.json', resolve);
    })
    .then(loadedFont => {
      font = loadedFont;

      return font;
    });
  } else {
    return font;
  }
}

function createText(text, color, font, position, size = 2000) {
  const tGeometry = new THREE.TextGeometry(
    text,
    {
      font: font,
      size: size,
      height: 10,
      bevelEnabled: false,
      curveSegments: 24
    }
  );
  const tMaterial = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
  const tMesh = new THREE.Mesh(tGeometry, tMaterial);
  tMesh.position.set(...position);
  tMesh.rotateX( Math.PI / 2 );
  return tMesh;
}

function createMesh(vertices, color) {
  const tGeometry = new THREE.BufferGeometry();
  tGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertices.flat()), 3)
  );
  const tMaterial = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.75,
    color: color,
    side: THREE.DoubleSide
  });
  const tMesh = new THREE.Mesh(tGeometry, tMaterial);
  tMesh.geometry.computeVertexNormals();
  tMesh.geometry.computeFaceNormals();

  return tMesh;
}

function createPolyline(vertices, color) {
  const tGeometry = new THREE.BufferGeometry();
  tGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertices.flat()), 3)
  );

  const tLine = new THREE.Line(tGeometry, new THREE.LineBasicMaterial({ color }));
  return tLine;
}

function generateGeometriesFromBuildingPart(buildingPart) {
  const tBuildingPartGroup = new THREE.Group();

  if (buildingPart.tags.type === 'floors') {
    // All floors are grouped
    buildingPart.items.forEach(floorGroup => {
      // Each individual floor is a group of polylines
      floorGroup.items.forEach(floorPolygon => {
        // Create mesh from closed polyline (easier to handle selection with a mesh)
        const vertices = floorPolygon.points.map(point => [point.x, point.y, point.z]);
        const triangleIndices = Earcut.triangulate(vertices.flat(Infinity), undefined, 3);
        const tMesh = createMesh(triangleIndices.map(index => vertices[index]), 'gray');

        tMesh.floorMeta = { ...floorGroup.tags, pos: floorGroup.items[0].points[0] }
        tMesh.isFloor = true;

        tBuildingPartGroup.add(tMesh);
      });
    });
  } else {
    buildingPart.items.forEach(polygon => {
      // Create line
      const vertices = polygon.points.map(point => [point.x, point.y, point.z]);
      const tLine = createPolyline(vertices, 'lightgray');
      tBuildingPartGroup.add(tLine);
    });
  }
  tBuildingPartGroup.isRoof = buildingPart.tags.type === 'roof';
  tBuildingPartGroup.isFloors = buildingPart.tags.type === 'floors';
  if (buildingPart.tags.type === 'roof') {
    tBuildingPartGroup.topPoint = findRoofHighestPoint(buildingPart.items)
  }

  return tBuildingPartGroup;
}

function findRoofHighestPoint (items) {
  let highest = {z:0};

  items.forEach((item) => {
    item.points.forEach((point) => {
      if (point.z > highest.z) {
        highest = point;
      }
    })
  })

  return highest;
}

function generateBuildingGeometriesFromData(data) {
  // Iterate buildings, convert each building into a group of lines
  const buildingGeometries = data.items.map(building => {
    const tBuildingGroup = new THREE.Group();
    // Iterate building parts (roof, walls, base, floors)
    building.items.forEach(buildingPart => {
      const tBuildingPartGroup = generateGeometriesFromBuildingPart(buildingPart);
      tBuildingGroup.add(tBuildingPartGroup);
    });

    tBuildingGroup.tags = building.tags;
    tBuildingGroup.name = building.tags.name;

    return tBuildingGroup;
  });

  buildingGeometries.forEach((group) => {
    group.topPoint = findRoofPoint(group);
  })

  return buildingGeometries;
}

function Group(props) {
  return (
    <group {...props}>
      { props.items &&
        props.items.map((tObject, index) => {
          return <primitive key={ index } object={ tObject } />;
        })
      }
    </group>
  );
}

function findRoofPoint (objects) {
  const roof = objects.children.find(object => object.isRoof)
  return [roof.topPoint.x, roof.topPoint.y, roof.topPoint.z];
}

const BuildingText = React.memo(function BuildingText({ name, area, xPos, yPos, zPos }) {
  return (
    <Group
      items={ [createText(name, "purple", font, [xPos,yPos,zPos]),
      createText(`height: ${zPos / 1000} m`, "purple", font, [xPos + 2000, yPos, zPos + 1000], 500),
      createText(`area: ${(area / 1000000).toFixed(2)} m²`, "purple", font, [xPos + 2000, yPos, zPos], 500)] }
    />
  )
})

const FloorText = React.memo(function FloorText ({item, xPos, yPos}) {
  return (
    <Group
      items={ [createText(`Level: ${item.floorMeta.level}`, "purple", font, [xPos, yPos, item.floorMeta.pos.z + 550], 500),
      createText(`Area: ${(item.floorMeta.area / 1000000).toFixed(2)} m²`, "purple", font, [xPos, yPos, item.floorMeta.pos.z], 500)] }
    />
  );
})

function Building(props) {
  const { topPoint } = props.object;

  return (
    <group>
      <BuildingText
        name={props.object.tags.name}
        area={props.object.tags.area}
        xPos={topPoint[0]}
        yPos={topPoint[1]}
        zPos={topPoint[2]}
      />

      {props.object.children.find(item => item.isFloors).children.map((floor, key) => {
        return (
          <FloorText
            key={key}
            item={floor}
            xPos={topPoint[0]}
            yPos={topPoint[1]}
          />
        )
      })}

      <primitive
        object={ props.object }
        onClick={ e => console.log("onClick", e) }
        onPointerOver={ e => console.log("onPointerOver") }
        onPointerOut={ e => console.log("onPointerOut") } />;
    </group>
  )
}

export default function App() {
  const [buildingGeometries, setBuildingGeometries] = useState();
  const [sampleGeometries, setSampleGeometries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dimension, setDimension] = useState({});

  useEffect(() => {
    if (isLoading) {
      loadData(dimension)
        .then(data => generateBuildingGeometriesFromData(data))
        .then(geometries => setBuildingGeometries(geometries))
        .then(() => {
          setTimeout(() => {
            setIsLoading(false);
          }, 500)
        });
    }
  }, [isLoading]);

  useEffect(() => {
    loadFont()
      .then(font => {
        // Sample threejs objects
        setSampleGeometries([
          createPolyline(
            [
              [0, 10000, 0],
              [10000, 10000, 0],
              [10000, 10000, 10000],
              [0, 10000, 10000],
              [0, 10000, 0]
            ],
            "hotpink"
          ),
          createText("sample", "purple", font, [0, 10000, 10000])
        ]);
      });
  }, []);

  const handleSubmit = e => {
    e.preventDefault();
    setIsLoading(true);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Canvas style = {{ height: 600 }}
        camera = {{
          up: [0, 0, 1],
          position: [20000, 20000, 20000],
          near: 1000,
          far: 400000,
          fov: 70
        }}
        onCreated = {({ gl }) => {
          gl.setClearColor("#eeeeee");
        }}>
          <ambientLight intensity={ 1.0 } />
          <directionalLight intensity={ 0.2 } position = { [1, 1, 1] } />
          { buildingGeometries && buildingGeometries.length > 0 &&
            buildingGeometries.map((buildingGeometry, index) => {
              return <Building
                key={ index }
                object={ buildingGeometry }
                onClick={ e => console.log("onClick") }
                onPointerOver={ e => console.log("onPointerOver") }
                onPointerOut={ e => console.log("onPointerOut") } />;
            })
          }
        <CameraControls / >
      </Canvas>

      <div className="buildingListContainer">
        <ul className="buildingList">
          <li className="buildingListItem">
            <div className="buildinglistItemHCell">Building</div>
            <div className="buildinglistItemHCell">Height (mm)</div>
            <div className="buildinglistItemHCell">Width (mm)</div>
            <div className="buildinglistItemHCell">Roof angle</div>
          </li>
          { buildingGeometries && buildingGeometries.length > 0 &&
            buildingGeometries.map((buildingGeometry, index) => {
              return (
                <li className="buildingListItem" key={ index }>
                  <div className="buildinglistItemCell">
                    { buildingGeometry.tags.name }
                  </div>
                  <div className="buildinglistItemCell">
                    <NumericInput index={index} type="dimension" name="height" onChange={e => setDimension({...dimension, [index]: {...dimension[index], [e.target.name]: e.target.value}})} initialValue={10000} />
                  </div>
                  <div className="buildinglistItemCell">
                    <NumericInput index={index} type="dimension" name="width" onChange={e => setDimension({...dimension, [index]: {...dimension[index], [e.target.name]: e.target.value}})} initialValue={10000} />
                  </div>
                  <div className="buildinglistItemCell">
                    <NumericInput index={index} type="angle" name="roofAngle" onChange={e => setDimension({...dimension, [index]: {...dimension[index], [e.target.name]: e.target.value}})} initialValue={30} />
                  </div>
                </li>
              )
            })
          }
        </ul>
      </div>

      <button className="submitButton">Submit changes</button>
      
      {isLoading ? 
        <div className="loadingOverlay">
          <div className="loadingSpinner"></div>
        </div>
      : ''}

    </form>
  );
}
