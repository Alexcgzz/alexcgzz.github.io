
import './App.css';
import { ChakraProvider } from '@chakra-ui/react'
import Content from './content';
import { useEffect, useRef } from 'react';


// const spotlightEl = document.querySelector("#spotlight");
// function handleMouseMove(event) {
//   const { clientX, clientY } = event;
  
//   spotlightEl.style.background = `radial-gradient(circle at ${clientX}px ${clientY}px, #00000000 10px, #000000ee 350px)`;
// }

// document.addEventListener("mousemove", handleMouseMove)

function App() {

  const spotlight = useRef()

  useEffect(() => {
    console.log(spotlight)
  },[])

  return (
    <div className="App" id='spotlight' ref={spotlight}>
      <ChakraProvider>
        <Content />
      </ChakraProvider>
    </div>
  );
}


export default App;
