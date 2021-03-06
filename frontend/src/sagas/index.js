import { delay } from 'redux-saga'
import { all, call, cancel, fork, put, select, take, takeEvery, takeLatest } from 'redux-saga/effects';
import * as api from '../api';
import * as actions from '../actions';
import * as actionType from '../action-types';
import { getCurrentUserUrl, getWorldUrl } from '../selectors/api';
import { getStudentUrl,
         getPracticeOverviewUrl,
         getStartTaskUrl,
         getReportProgramEditUrl,
         getReportProgramExecutionUrl,
         getWatchInstructionUrl } from '../selectors/student';
import { getTaskById,
         getToolbox } from '../selectors/task';
import { getTaskId,
         getRoboAst,
         getMiniRoboCode,
         getLengthLimit,
         getTaskSourceText,
         isInterpreting } from '../selectors/taskEnvironment';
import { getColor, getPosition, isSolved, isDead, getGameStage } from '../selectors/gameState';
import { getNextLevelStatus } from '../selectors/practice';
import { interpretRoboAst, InterpreterError } from '../core/roboCodeInterpreter';
import { parseTaskSourceText } from '../core/taskSourceParser';
import { downloadTextFile, loadTextFile } from '../utils/files';
import googleAnalyticsSaga from './googleAnalytics';


function* fetchApiRoot() {
  try {
    const apiRoot = yield call(api.fetchApiRoot);
    yield put(actions.fetchApiRoot.success(apiRoot));
  } catch (error) {
    yield put(actions.fetchApiRoot.failure(error));
  }
}


function* fetchWorld(action) {
  try {
    const world = yield call(api.fetchWorld, action.payload.url);
    yield put(actions.fetchWorld.success(world));
  } catch (error) {
    yield put(actions.fetchWorld.failure(error));
  }
}


function* fetchUser(action) {
  try {
    const user = yield call(api.fetchUser, action.payload.url);
    yield put(actions.fetchUser.success(user));
  }
  catch (error) {
    yield put(actions.fetchUser.failure(error));
  }
}


function* fetchStudent(action) {
  try {
    const { url } = action.payload;
    const student = yield call(api.fetchStudent, url);
    yield put(actions.fetchStudent.success(student));
  } catch (error) {
    yield put(actions.fetchStudent.failure(error));
  }
}


function* fetchPracticeOverview(action) {
  try {
    const { url } = action.payload;
    const practiceOverview = yield call(api.fetchPracticeOverview, url);
    yield put(actions.fetchPracticeOverview.success(practiceOverview));
  } catch (error) {
    yield put(actions.fetchPracticeOverview.failure(error));
  }
}


function* watchInstruction(action) {
  try {
    const { instructionId } = action.payload;
    const url = yield select(getWatchInstructionUrl);
    yield call(api.seeInstruction, url, instructionId);
    yield put(actions.seeInstruction.success(instructionId));
  } catch (error) {
    yield put(actions.seeInstruction.failure(error));
  }
}


function* watchTasks(dispatch, getState) {
  const openTaskFlows = {};
  while (true) {
    const action = yield take(actionType.SET_TASK);
    const { taskEnvironmentId, task } = action.payload;
    const oldFlow = openTaskFlows[taskEnvironmentId];
    if (oldFlow) {
      yield cancel(oldFlow);
    }
    const newFlow = yield fork(taskFlow, dispatch, getState, taskEnvironmentId, task);
    openTaskFlows[taskEnvironmentId] = newFlow;
  }
}


// TODO: Rewrite this saga without calling dispatch and getState;
//       then remove these two parameters.
function* taskFlow(dispatch, getState, taskEnvironmentId, task) {
  while (true) {
    const action = yield take([actionType.RUN_PROGRAM_START, actionType.DO_ACTION_MOVE]);
    if (action.payload.taskEnvironmentId !== taskEnvironmentId) {
      continue;
    }

    if (action.type === actionType.DO_ACTION_MOVE) {
      const { interruptible } = action.payload;
      // TODO: dry repeated interruption check
      let interpreting = yield select(isInterpreting, taskEnvironmentId);
      if (interruptible && !interpreting) {
        continue;
      }
      yield put(actions.doAction(taskEnvironmentId, action.payload.action));
      yield call(delay, 200);

      interpreting = yield select(isInterpreting, taskEnvironmentId);
      if (interruptible && !interpreting) {
        continue;
      }
      yield put(actions.move(taskEnvironmentId));
      yield call(delay, 200);

      interpreting = yield select(isInterpreting, taskEnvironmentId);
      if (interruptible && !interpreting) {
        continue;
      }
      yield put(actions.evolveWorld(taskEnvironmentId));
    }

    if (action.type === actionType.RUN_PROGRAM_START) {
      // TODO: factor out limit check
      const { limit, used } = yield select(getLengthLimit, taskEnvironmentId);
      if (limit !== null && used > limit) {
        alert(`Violated actions limit: ${used}/${limit}`);
        continue;
      }

      const roboAst = yield select(getRoboAst, taskEnvironmentId);
      yield put(actions.interpretationStarted(taskEnvironmentId));
      const context = {
        doActionMove: (action) => dispatch(actions.doActionMove(taskEnvironmentId, action)),
        color: () => getColor(getState(), taskEnvironmentId),
        position: () => getPosition(getState(), taskEnvironmentId),
        isSolved: () => isSolved(getState(), taskEnvironmentId),
        isDead: () => isDead(getState(), taskEnvironmentId),
        interrupted: () => {
          const stage = getGameStage(getState(), taskEnvironmentId);
          return stage === 'initial';
        }
      };
      interpretRoboAst(roboAst, context)
        .catch(handleInterpreterError)
        .then(() => dispatch(actions.interpretationFinished(taskEnvironmentId)));
    }
  }
}


function handleInterpreterError(error) {
  if (error instanceof InterpreterError) {
    alert(error.message);
  } else {
    throw error;
  }
}


function* startTask(action) {
  const { taskEnvironmentId, taskId } = action.payload;
  const setTaskByIdAction = actions.setTaskById(taskEnvironmentId, taskId);
  yield put(setTaskByIdAction);
  const startTaskUrl = yield select(getStartTaskUrl);
  const { taskSessionId } = yield call(api.startTask, startTaskUrl, taskId);
  const programEditUrl = yield select(getReportProgramEditUrl);
  const programExecutionUrl = yield select(getReportProgramExecutionUrl);
  let prevMiniCode = null;
  let miniCode = null;
  while (true) {
    const action = yield take([
      actionType.START_TASK_REQUEST,
      actionType.INTERPRETATION_FINISHED,
      actionType.EDIT_PROGRAM_AST,
      actionType.EDIT_PROGRAM_CODE,
    ]);
    if (action.payload.taskEnvironmentId !== taskEnvironmentId) {
      continue;
    }
    if (action.type === actionType.START_TASK_REQUEST) {
      // Terminate current saga when new task starts in this task environment.
      break;
    } else if (action.type === actionType.EDIT_PROGRAM_AST) {
      prevMiniCode = miniCode;
      miniCode = yield select(getMiniRoboCode, taskEnvironmentId);
      if (prevMiniCode !== null && prevMiniCode !== miniCode) {
        yield call(api.reportProgramEdit, programEditUrl, taskSessionId, miniCode);
      }
    } else if (action.type === actionType.EDIT_PROGRAM_CODE) {
      // TODO: Report code edits.
      console.warn('Reporting code edits not implemented yet.')
    } else if (action.type === actionType.INTERPRETATION_FINISHED) {
      const program = yield select(getMiniRoboCode, taskEnvironmentId);
      const solved = yield select(isSolved, taskEnvironmentId);
      const report = yield call(api.reportProgramExecution,
        programExecutionUrl, taskSessionId, program, solved);
      if (solved) {
        yield put(actions.runProgram.solvedReport(taskEnvironmentId, report));
      }
    }
  }
}


// Intercept setTask action to add complete task record
// (which is currently required by some reducers).
function* setTask(action) {
  const { taskEnvironmentId, taskId } = action.payload;
  const task = yield select(getTaskById, taskId);

  // inject toolbox - needed for some reducers
  task.toolbox = yield select(getToolbox, taskId);

  const setTaskAction = actions.setTask(taskEnvironmentId, task);
  yield put(setTaskAction);
}


function* initializeApp() {
  yield* fetchApiRoot();
  const worldUrl = yield select(getWorldUrl);
  yield* fetchWorld(actions.fetchWorld.request(worldUrl));
  const currentUserUrl = yield select(getCurrentUserUrl);
  yield* fetchUser(actions.fetchUser.request(currentUserUrl));

  const studentUrl = yield select(getStudentUrl);
  yield* fetchStudent(actions.fetchStudent.request(studentUrl));

  const practiceOverviewUrl = yield select(getPracticeOverviewUrl);
  const practiceOverviewAction = actions.fetchPracticeOverview.request(practiceOverviewUrl);
  yield* fetchPracticeOverview(practiceOverviewAction);
}


function* exportTask(action) {
  const { taskEnvironmentId } = action.payload;
  try {
    const taskId = yield select(getTaskId, taskEnvironmentId);
    const taskSourceText = yield select(getTaskSourceText, taskEnvironmentId);
    downloadTextFile(`${taskId}.md`, taskSourceText);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}


function* importTask(action) {
  const { taskEnvironmentId } = action.payload;
  try {
    const taskSourceText = yield call(loadTextFile);
    const task = parseTaskSourceText(taskSourceText);
    yield put(actions.setTask(taskEnvironmentId, task));
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}


function* showLevelProgress() {
  const nextLevelStatus = yield select(getNextLevelStatus);
  if (nextLevelStatus !== null) {
    yield put(actions.showLevelProgress.next(nextLevelStatus));
  }
}


function* watchActions() {
  yield takeLatest(actionType.FETCH_STUDENT_REQUEST, fetchStudent);
  yield takeLatest(actionType.FETCH_PRACTICE_OVERVIEW_REQUEST, fetchPracticeOverview);

  yield takeLatest(actionType.EXPORT_TASK, exportTask);
  yield takeLatest(actionType.IMPORT_TASK, importTask);

  yield takeEvery(actionType.START_TASK_REQUEST, startTask);
  yield takeEvery(actionType.SET_TASK_BY_ID, setTask);
  yield takeEvery(actionType.SEE_INSTRUCTION_REQUEST, watchInstruction);
  yield takeLatest(actionType.SHOW_LEVEL_PROGRESS_START, showLevelProgress);
}


// TODO: Rewrite all sagas without need for dispatch and getState;
//       then remove these two parameters.
function* rootSaga(dispatch, getState) {
  yield all([
    initializeApp(),
    watchActions(),
    watchTasks(dispatch, getState),
    googleAnalyticsSaga(),
  ]);
}

export default rootSaga;
