import React, {
  useState,
  MouseEventHandler,
  MouseEvent,
  useEffect
} from "react";

import reverseUint32 from "./reverse-u32";
import { throttle } from "../lib/throttle";
import { useConnection } from "./connection";
import CurrentUser from "./current-user";
import Register from "./register";
import { DrawLine, CommandMessage, Player } from "@pbn/messages";
type Color = Uint32Array | number;

type PixelData = {
  width: number;
  height: number;
  data: Uint32Array;
};

const GameBoard: React.FC = () => {
  const gameBoard = React.createRef<HTMLCanvasElement>();
  const [color, setColor] = useState(0x2f395dff);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>();
  // const getContext = () => gameBoard.current!.getContext("2d")!;
  const [drawing, setDrawing] = useState(false);
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const { client, connected } = useConnection();
  const [user, setUser] = useState<Player | undefined>();

  const onMouseDown: MouseEventHandler = e => {
    setDrawing(true);
    const [x, y] = getEventPosition(e);
    setCurrentX(x);
    setCurrentY(y);
  };

  useEffect(() => {
    if (gameBoard.current) setContext(gameBoard.current.getContext("2d"));
  }, [gameBoard]);

  const onMouseUp: MouseEventHandler = e => {
    if (!drawing) return;
    setDrawing(false);
    const [x, y] = getEventPosition(e);

    drawLine(currentX, currentY, x, y);
  };

  const selectColor = (color: number, emit = true) => {
    setColor(color);

    if (connected && emit) {
      client.send("setColor", {
        color
      });
    }
  };

  client.connection!.onmessage = event => {
    if (!context) {
      console.log("MISSING CONEXT");
      return;
    }
    // console.info("WebSocket message received22222:", event);
    // console.log("DATA", event.data)
    const w = context.canvas.width;
    const h = context.canvas.height;
    const commandMessage = CommandMessage.deserializeBinary(
      new Uint8Array(event.data)
    );
    switch (commandMessage.getCommand()) {
      case 1:
        const drawLineMsg = DrawLine.deserializeBinary(
          commandMessage.getPayload_asU8()
        ).toObject();
        drawLine(
          drawLineMsg.x0 * w,
          drawLineMsg.y0 * h,
          drawLineMsg.x1 * w,
          drawLineMsg.y1 * h,
          false
        );
        break;

      default:
        break;
    }
    // console.log("command", commandMessage.getCommand())
    // console.log("payload", commandMessage.getPayload())
    return;
    // const w = context.canvas.width;
    // const h = context.canvas.height;
    // console.log(event.data.buffer, typeof event.data.buffer)
    // const parsedData = JSON.parse(event.data);
    // const data = parsedData.payload;
    // switch (parsedData.action) {
    //   case "setColor":
    //     selectColor(data.color, false);
    //     break;
    //   case "drawLine":
    // drawLine(
    //   data.x0 * w,
    //   data.y0 * h,
    //   data.x1 * w,
    //   data.y1 * h,
    //   color,
    //   false
    // );
    //     break;
    //   case "floodFill":
    //     floodFill(data.x * w, data.y * h, color, false);
    //     break;
    //   case "yourDetails":
    //     setUser(new Player(data.payload));
    //     break;
    //   default:
    //     break;
    // }
  };
  // client.on("drawLine", (payload) => {
  //   drawLine(payload.x0, payload.x1, payload.y0, payload.y1, color, false)
  // })

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    emit: boolean = true
  ) => {
    if (!context) {
      console.log("no context drawLine");
      return;
    }
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.strokeStyle = `#${color.toString(16)}`;
    context.lineWidth = 2;
    context.stroke();
    context.closePath();

    if (connected && emit) {
      const width = context.canvas.width;
      const height = context.canvas.height;
      const drawLine = new DrawLine();

      drawLine.setX0(x0 / width);
      drawLine.setY0(y0 / height);
      drawLine.setX1(x1 / width);
      drawLine.setY1(y1 / height);

      const commandMessage = new CommandMessage();
      commandMessage.setCommand(1);
      commandMessage.setPayload(drawLine.serializeBinary());
      client.connection &&
        client.connection.send(commandMessage.serializeBinary());
    }
  };

  const onMouseMove: MouseEventHandler = e => {
    if (!drawing) {
      return;
    }
    const [x, y] = getEventPosition(e);
    drawLine(currentX, currentY, x, y);
    setCurrentX(x);
    setCurrentY(y);
  };

  const [useFillBucket, setUseFillBucket] = useState(false);

  const getEventPosition = (e: MouseEvent): [number, number] => {
    const { left, top } = gameBoard.current!.getBoundingClientRect();
    return [e.pageX - left, e.pageY - top];
  };

  const getPixel = (pixelData: PixelData, x: number, y: number): Color => {
    if (x < 0 || y < 0 || x >= pixelData.width || y >= pixelData.height) {
      return -1; // impossible color
    } else {
      return pixelData.data[y * pixelData.width + x];
    }
  };

  const floodFill = (x: number, y: number, color: number, emit = true) => {
    if (!context) {
      console.log("no context floodFill");
      return;
    }
    const fillColor = reverseUint32(color);

    const imageData = context.getImageData(
      0,
      0,
      context.canvas.width,
      context.canvas.height
    );

    const pixelData = {
      width: imageData.width,
      height: imageData.height,
      data: new Uint32Array(imageData.data.buffer)
    };

    const targetColor = getPixel(pixelData, x, y);

    if (targetColor !== fillColor) {
      const queue = [[x, y]];
      while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        const currentCollor = getPixel(pixelData, x, y);
        if (targetColor === currentCollor) {
          pixelData.data[y * pixelData.width + x] = fillColor;
          queue.push([x + 1, y]);
          queue.push([x - 1, y]);
          queue.push([x, y + 1]);
          queue.push([x, y - 1]);
        }
      }
      context.putImageData(imageData, 0, 0);
    }

    if (connected && emit) {
      const width = context.canvas.width;
      const height = context.canvas.height;
      client.send("floodFill", {
        x: x / width,
        y: y / height,
        color: color
      });
    }
  };

  const onClick: MouseEventHandler = e => {
    if (useFillBucket) {
      const [x, y] = getEventPosition(e);
      floodFill(x, y, color);
    }
  };
  const colors = [0x2f395dff, 0x3a4d52ff, 0xe74025ff, 0xeb7a3eff, 0xf4da83ff];
  return (
    <div>
      {user ? <CurrentUser user={user} /> : <Register />}
      <div>Connected: {connected ? "Connected" : "Offline"}</div>
      <button
        style={{
          backgroundColor: useFillBucket ? `#${color.toString(16)}` : "white"
        }}
        onClick={() => setUseFillBucket(!useFillBucket)}
      >
        Fill bucket
      </button>
      <br />
      {colors.map((color, index) => (
        <button
          key={index}
          style={{ backgroundColor: `#${color.toString(16)}` }}
          onClick={() => selectColor(color)}
        >
          X
        </button>
      ))}
      <br />
      <canvas
        ref={gameBoard}
        style={{ border: "1px solid cyan" }}
        width={400}
        height={300}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onMouseMove={throttle(onMouseMove, 10)}
      />
    </div>
  );
};

export default GameBoard;
