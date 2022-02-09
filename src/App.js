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
    console.log('dimension', dimension)

    console.log(Object.keys(dimension))

    const keys = Object.keys(dimension);

    let largest = 0;

    keys.forEach((k) => {
      if (parseInt(k) > largest) {
        largest = parseInt(k);
      }
    })

    params = Array.apply(null, Array(largest + 1)).map(function () {})


    Object.keys(dimension).forEach((key) => {
      console.log(key, dimension[key], params[key])
      params[key] = dimension[key]

    })


    console.log('params', params)

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

async function loadStaticData() {
  
  const response = await fetch(
    `/buildings.json`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      }
    },
  );

  const result = await response.json();
  return result;
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

function createText(text, color, font, position) {
  const tGeometry = new THREE.TextGeometry(
    text,
    {
      font: font,
      size: 2000,
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

        console.log('floor', floorGroup )

        tMesh.floorMeta = { ...floorGroup.tags }

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

    console.log(tBuildingGroup)

    return tBuildingGroup;
  });

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

function Building(props) {
  const roofPoint = findRoofPoint(props.object);

  return (
    <group>
      <Group
        items={ [createText(props.object.tags.name, "purple", font, roofPoint)] }
      />

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
        .then(setIsLoading(false));
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
            <div className="buildinglistItemHCell">Height</div>
            <div className="buildinglistItemHCell">Width</div>
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

      <button>Submit changes</button>
    </form>
  );
}
