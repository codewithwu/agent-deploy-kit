
from typing import TypedDict, List, Literal  
from langchain_core.documents import Document  
from pydantic import BaseModel  


class AgentState(TypedDict):  
    question:       str  
    route:          str                   # vector | graph | web | direct  
    documents:      List[Document]  
    generation:     str  
    rewrite_count:  int  
    grade_results:  List[str]  


class RouteDecision(BaseModel):  
    route: Literal["vector", "graph", "web", "direct"]  
    reasoning: str  

class GradeDoc(BaseModel):  
    score: Literal["relevant", "irrelevant"]  

class HallucinationCheck(BaseModel):  
    grounded: Literal["yes", "no"]  