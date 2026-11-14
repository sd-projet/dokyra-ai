from app.infrastructure.run_tree import RunTree


def test_llm_call_made_by_the_agent_itself_is_not_inside_a_tool():
    t = RunTree()
    t.start("graph", None)
    t.start("agent-node", "graph")
    t.start("llm-1", "agent-node")
    assert not t.inside_tool("llm-1")


def test_llm_call_nested_in_a_tool_is_detected_at_any_depth():
    t = RunTree()
    t.start("graph", None)
    t.start("tools-node", "graph")
    t.start("tool-compare", "tools-node", is_tool=True)
    t.start("chain-inside-tool", "tool-compare")
    t.start("llm-nested", "chain-inside-tool")
    assert t.inside_tool("llm-nested")
    assert t.inside_tool("chain-inside-tool")
    assert not t.inside_tool("tool-compare")  # l'outil lui-même n'est pas « dans » un outil


def test_unknown_run_and_cycles_are_safe():
    t = RunTree()
    assert not t.inside_tool("never-seen")
    t.start("a", "b")
    t.start("b", "a")  # cycle pathologique : ne doit pas boucler
    assert not t.inside_tool("a")
