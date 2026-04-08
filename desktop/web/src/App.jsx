import AppLayout from "./features/app/AppLayout"
import useAppController from "./features/app/useAppController"

function App() {
  const controller = useAppController()
  return <AppLayout controller={controller} />
}

export default App
